require('dotenv').config();

const { chromium } = require('playwright');

(async () => {

    const browser = await chromium.launch({
        headless: false
    });

    const page = await browser.newPage();

    // Log every request
    page.on('request', request => {

        console.log("\n==============================");
        console.log(request.method());
        console.log(request.url());

        const headers = request.headers();

        if (
            request.url().includes("api") ||
            request.url().includes("graphql") ||
            request.url().includes("jobs") ||
            request.url().includes("career") ||
            request.url().includes("rpc") ||
            request.url().includes("search")
        ) {
            console.log("Headers:");
            console.log(headers);

            const postData = request.postData();

            if (postData) {
                console.log("Payload:");
                console.log(postData);
            }
        }
    });

    // Log every response
    page.on('response', async response => {

        const url = response.url();

        if (
            url.includes("api") ||
            url.includes("graphql") ||
            url.includes("jobs") ||
            url.includes("career") ||
            url.includes("rpc") ||
            url.includes("search")
        ) {

            console.log("\n******** RESPONSE ********");
            console.log(url);

            try {

                const text = await response.text();

                console.log(text.substring(0,2000));

            } catch(e){}

        }

    });

    await page.goto(
        "https://www.google.com/about/careers/applications/jobs/results",
        {
            waitUntil:"networkidle"
        }
    );

    console.log("\nBrowser opened.");
    console.log("Search Software Engineer manually.");
    console.log("After results load press ENTER here.");

    process.stdin.resume();

    process.stdin.on("data", async()=>{

        await browser.close();

        process.exit();

    });

})();