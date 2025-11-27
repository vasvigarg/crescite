# Crescite – Financial Portfolio Optimizer

*The name Crescite is Latin for "grow" or "increase". This name encapsulates the core motivation of the project: to help users actively grow their wealth and increase the efficiency of their financial portfolio by providing data-driven analysis and automated rebalancing recommendations.*

---

## Overview
Crescite is a backend service that automates the analysis and rebalancing of mutual‑fund portfolios. Users upload a Consolidated Account Statement (CAS) PDF, which is parsed to extract transaction details. The system then enriches each fund with real historical Net Asset Value (NAV) data from **mfapi.in**, computes accurate financial metrics (CAGR, volatility, Sharpe ratio), derives a **Power Score** for each fund, and generates a rebalancing recommendation.

## Core Workflow
1. **File Upload** – The client obtains a presigned S3 URL, uploads the CAS PDF, and notifies the backend via an API endpoint.
2. **Job Creation** – A job record is stored and a message is placed on RabbitMQ. Worker threads pick up the job.
3. **PDF Parsing** – `PdfParser` extracts lot information (fund name, units, NAV, amount, transaction date).
4. **NAV Enrichment** – `NavService` fetches the master list of mutual‑fund schemes from `https://api.mfapi.in/mf`, uses **Fuse.js** for fuzzy matching, and retrieves the full NAV history for the matched scheme.
5. **Financial Calculations** – `financial-math.ts` provides utilities to calculate:
   - **CAGR** (compound annual growth rate)
   - **Annualised volatility** (standard deviation of returns)
   - **Sharpe ratio** (risk‑adjusted return)
6. **Power Score Generation** – `PowerScoreCalculator` combines the rolling return, Sharpe ratio, and benchmark comparison into a 0‑100 score and produces a human‑readable recommendation.
7. **Rebalancing Logic** – `RebalanceCalculator` analyses the current allocation versus target percentages and creates buy/sell actions.
8. **Report Assembly** – All lot data, power scores, and rebalancing actions are packaged into a JSON report stored in the database and returned to the client.

## Technology Stack
- **Node.js** with **TypeScript** – core runtime and type safety.
- **Express** – HTTP API layer.
- **Prisma** – ORM for PostgreSQL.
- **Redis** – caching and job queue coordination.
- **RabbitMQ** – distributed job processing across worker threads.
- **AWS S3** – secure storage of uploaded PDFs.
- **mfapi.in** – free public API for Indian mutual‑fund NAV history.
- **jsonwebtoken** – JWT based authentication for securing API endpoints.
- **Fuse.js** – fuzzy‑search library for matching fund names to API scheme codes.
- **Jest & ts‑jest** – test framework (unit and integration tests).
- **pdf-parse** – extracts text from uploaded PDF files.
- **dotenv** – environment variable management.
- **Axios** – HTTP client for external API calls.

## Data Flow Summary
1. **Upload** → S3 → Job queued.
2. **Worker** reads PDF → extracts lots.
3. For each lot, **NavService** resolves the scheme code and pulls historical NAV.
4. **Financial utilities** compute CAGR, volatility, and Sharpe.
5. **PowerScoreCalculator** builds a score and recommendation.
6. **RebalanceCalculator** determines optimal buy/sell actions.
7. Final JSON report is persisted and returned.

## More Features to be Added
- **projectedReturns**: Add a projection engine that forecasts future NAV based on historical trends, Monte‑Carlo simulation, or analyst forecasts. The engine would compute an expected return for each fund and store it in the report under `projectedReturns`.

- **switchingCost**: Introduce a cost model that accounts for brokerage fees, taxes, and slippage when buying or selling. This calculation would be performed in the `RebalanceCalculator` and added to the report as `switchingCost`.

- **netBenefit**: Derive the net benefit by subtracting `switchingCost` from `projectedReturns`. This value would be included in the final JSON payload, allowing the client to see the expected gain after transaction costs.

---

*This README focuses on the functional workflow and the technologies that power Crescite. It does not cover file‑structure details, contribution guidelines, or execution instructions as its actively under development.*
