import {
    launch
} from "puppeteer";

const scrapeTableData = async url => {
    const browser = await launch({
        headless: true
    });
    const page = await browser.newPage();
    let tableData = [];

    try {
        // Navigate to the specified URL
        await page.goto(url, {
            waitUntil: "domcontentloaded"
        });

        // Parse the table and extract URLs from the anchor tags
        tableData = await page.evaluate(() => {
            const rows = document.querySelectorAll("#searchresults > tbody > tr");
            const data = [];

            rows.forEach(row => {
                const span = row.querySelector("td.colTitle > span");
                if (span) {
                    const anchor = span.querySelector("a");
                    if (anchor) {
                        data.push({
                            url: anchor.href
                        });
                    }
                }
            });

            return data;
        });

        // Go to each URL and extract the date of the post
        for (const entry of tableData) {
            await page.goto(entry.url, {
                waitUntil: "domcontentloaded"
            });

            const postDate = await page.evaluate(() => {
                const dateElement = document.querySelector(
                    "#job-details > div > div.joblayouttoken.rtltextaligneligible.displayDTM.data-date.col-xs-12.col-sm-6.col-md-12.same-height.sap-font-72-Book > div > div > div > span.rtltextaligneligible"
                );
                return dateElement ? dateElement.textContent.trim() : null;
            });

            entry.postDate = postDate;
        }
    } catch (error) {
        console.error("Error:", error);
        return [];
    } finally {
        await browser.close();
    }

    return tableData;
};

export {
    scrapeTableData
};