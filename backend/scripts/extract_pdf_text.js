const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");

const filePath = path.resolve(
  "/mnt/c/Users/HP/Downloads/mock_portfolio_statement.pdf"
);

(async () => {
  try {
    const buf = fs.readFileSync(filePath);
    const data = await pdf(buf);
    const text = data.text || "";
    console.log("--- PDF TEXT START ---");
    console.log(text.slice(0, 2000));
    console.log("--- PDF TEXT END ---");
  } catch (err) {
    console.error("Error extracting PDF text:", err);
    process.exit(1);
  }
})();
