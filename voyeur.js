(async () => {
    try {
        // Requires
        const fetch = require("node-fetch")
        const { JSDOM } = require("jsdom");
        const moment = require('moment');
        const program = require('commander');
        const ProgressBar = require('progress');
        const cliProgress = require('cli-progress');

        // Utils
        const logs = []
        const logger = msg => {
            logs.push(msg)
        }


        /*
            Define the command-line interface
        */
        program
            .option('-s, --sample <number>', 'nums of the pornstar profiles to be crawled', "100")
            .option('-a, --age <number>', 'the exact age of the pornstar, it override the age_range option', "0")
            .option('-r, --age_range <range>', 'the age range at which they must fit', "0-0")
            .option('-g, --gender <type>', 'the gender of the pornstar', "female")
            .option('-spwa, --skip_without_age', 'skip pornstars without age')
            .option('-l, --logger', 'show the logs')
            .on('--help', function () {
                console.log('')
                console.log('Examples:');
                console.log('  $ node voyeur.js -s 30');
                console.log('  $ node voyeur.js -a 18');
                console.log('  $ node voyeur.js -r 18-30');
                console.log('  $ node voyeur.js -g female');
                console.log('  $ node voyeur.js -spwa');
                console.log('  $ node voyeur.js -l');
                console.log('')
                console.log('  $ node voyeur.js -s 30 -a 18 -l');
                console.log('  $ node voyeur.js -s 30 -r 18-20 -l -spwa');
                console.log('  $ node voyeur.js -s 30 -r 18-20 -a 30 -> \'a\' will override the \'r\' option');
            })
            .parse(process.argv);

        const numCrawledPornstars = parseInt(program.sample)
        const neededAge = Number(program.age)
        const ageRange = (program.age_range.split('-')).map(Number);
        const gender = program.gender
        const skipPornstarsWithoutAge = program.skip_without_age ? true : false
        const showLogs = program.logger ? true : false

        if (showLogs) {
            logger(numCrawledPornstars)
            logger(neededAge)
            logger(ageRange)
            logger(gender)
            logger(skipPornstarsWithoutAge)
        }
      

        // Useful Information
        let pornstars = []
        const pornstarUrls = []

        // Let's go

        /*
            Get the profiles url adress
        */

        console.log("Getting the url adress of the profiles...")

        // create a new progress bar instance
        const urlsProgress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        urlsProgress.start(numCrawledPornstars, 0, { speed: 1 });

        
        let crtPage = 0
        while (++crtPage === 1 || pornstarUrls.length < numCrawledPornstars) {
            const url = `https://www.pornhub.com/pornstars?gender=${gender}&page=${crtPage}`

            if (!showLogs) {
                logger(`Now crawling ${url}...`)
            }

            const html = await (await fetch(url)).text()
            let document = (new JSDOM(html)).window.document
            if (!document.querySelector("#popularPornstars")) break // no more shit to crawl
            const listItems = document.querySelector("#popularPornstars").children

            for (let listItem of listItems) {
                if (listItem.className) continue // Skip divs with class names, because those aren't pornstar divs

                if (!listItem.children[0] || !listItem.children[0].children[1]) continue // Corrupt link
                const href = `https://www.pornhub.com${listItem.children[0].children[1].href}`
                pornstarUrls.push(href)
     
                urlsProgress.increment(1)
                
                if (pornstarUrls.length >= numCrawledPornstars) break
            }

            if (showLogs) {
                logger(`Number of pornstar urls: ${pornstarUrls.length} after ${crtPage} pages\n`)
            }
            if (listItems.length === 0) break // no more shit to crawl
            ++crtPage
        }

        urlsProgress.stop()

        /*
            Crawl the urls
        */
        console.log("\nStarting to crawl the profiles...")

        // create a new progress bar instance 
        const crawlProgress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        crawlProgress.start(pornstarUrls.length, 0, { speed: 1 });


        for (let url of pornstarUrls) {
            try {
                const html = await (await fetch(url)).text()
                // require("fs").writeFileSync("sal.html", html)
                document = (new JSDOM(html)).window.document

                if (showLogs) {
                    logger(url)
                }
                const rank = document.querySelector("div>span.big").parentElement.textContent.replace(/[a-zA-Z]/g, "").trim()
                const name = document.querySelector(".name").children[0].textContent.trim()

                const birthdateElement1 = document.querySelector("[itemprop=birthDate]")
                const birthdateElement2 = document.querySelector(".infoPiece")
                const birthdateInfo = birthdateElement1
                    ? birthdateElement1.textContent.trim()
                    : birthdateElement2.textContent.replace(/[a-zA-Z:]/g, "").trim()

                if (skipPornstarsWithoutAge && !birthdateInfo) continue

                // Format the birth date and determine the age
                const rawBirthDate = Date.parse(birthdateInfo.replace(",", ""))
                const birthDate = moment(rawBirthDate).format("MMM D GGGG")
                const age = moment().diff(rawBirthDate, 'years');

                if (showLogs) {
                    logger(`${name} ${rank}, ${birthDate}, ${age}`)
                } 


                pornstars.push({
                    name,
                    rank,
                    birthDate,
                    age,
                    url
                })

                crawlProgress.increment(1)

                if (pornstars.length >= numCrawledPornstars) break
            } catch (e) {
                if (showLogs) {
                    logger("Failed to mine this pornstar")
                    logger(e)
                }
            }
            if (showLogs) {
                logger(``)
            }
        }

        crawlProgress.stop()

        /*
            Filter the results
        */
        console.log("\nApplying the filters.")
        if (neededAge !== 0) {
            pornstars = pornstars.filter(pornstar => pornstar.age === neededAge)
        } else if (ageRange[0] !== 0 && ageRange[0] < ageRange[1]) {
            pornstars = pornstars.filter(pornstar => ageRange[0] <= pornstar.age && pornstar.age <= ageRange[1])
        }
        console.log(`Total results: ${pornstars.length}`)

        // Finalisation
        const pornstarsObject = {
            gender,
            total_results: pornstars.length,
            pornstars,
        }

        require("fs").writeFileSync(`./crawledData/pornstars_${new Date().getTime()}.json`, JSON.stringify(pornstarsObject, null, 4))
        if (showLogs) {
            require("fs").writeFileSync(`./logs.json`, JSON.stringify({ logs }, null, 4))
        }
    } catch (e) {
        logger(e)
    }
})()