# AI Financial Insights for FundHaven

This feature is an optional step toward a personal finance AI assistant.
It does not replace your existing Dashboard, Transactions, Reports, Budgets,
Goals, Settings, sidebar, or existing Lucide icons.

## Private monthly insights (no AI key needed)

1. Sign in to FundHaven and visit Dashboard.
2. Choose the desired month with the existing month selector.
3. Scroll to "AI Financial Insights".
4. Click "View spending insights (private)".

The GET /api/v1/ai/insights endpoint returns monthly category analysis,
budget warnings, and income-relative spending observations. These are
**rule-based calculations**, not the output of a trained AI model.
No external AI network request takes place.

## Optional real AI-generated suggestions

The separate "Generate AI advice" button uses OpenAI's Responses API.
It is OPTIONAL. An OpenAI API key with API billing is required.
A ChatGPT subscription does not automatically include API usage.

1. Create an API key: https://platform.openai.com/api-keys
2. Store it in the existing PRIVATE backend .env file:

    OPENAI_API_KEY=your_private_openai_api_key
    OPENAI_MODEL=gpt-4.1-mini

   The model line is optional. Review availability and cost in your OpenAI
   API dashboard. Never put this key in frontend JS, screenshots, git or chat.
3. Restart the backend:

    python -m uvicorn api:app --reload

4. Open the Dashboard and select a month.
5. Read the disclosure checkbox, tick it, click Generate AI advice.

The checkbox resets after every request and is never saved in localStorage.
The model is NOT called on page load or month changes.
The API request sets store=false for its OpenAI response.

### Data sent to OpenAI after consent ONLY

- Financial month, currency (NGN).
- Income if recorded, total expenses, remaining balance if known.
- Expense count; up to eight category labels and category totals.
- Up to eight budget category labels, limits, and spent totals.

NOT sent: user ID, name, email, JWT, passwords, individual transaction dates,
descriptions, notes, goal records or raw expense rows. Category labels
may still reveal sensitive information; consent disclosure states they
are sent. Use local insights if external sharing is not appropriate.

The model output is rendered as plain text (not HTML).
The guidance is educational only and can contain mistakes.

## API endpoints (JWT required)

GET /api/v1/ai/insights?month=2026-10
- Returns private rule-based insights; month optional, YYYY-MM format.

POST /api/v1/ai/insights with Content-Type application/json:

    {"month":"2026-10","share_aggregates_with_ai":true}

- 422: no consent / invalid month
- 503: key missing, provider unavailable, or provider rejected request
- 429: user reached development limit
- 200: one plain-text AI-generated response in advice field

## Security and usage limits

- OpenAI key is server-side.
- 15 second network timeout and bounded output tokens.
- Provider input contains only aggregate data for authenticated user.
- In-process per-user limit is 3 AI calls per hour. For production,
  replace this with a distributed limiter such as Redis.
- Set OpenAI billing budgets and monitor usage before public deployment.
- Obtain appropriate consent and privacy disclosures for external data use.

## Testing

The test suite mocks OpenAI and never makes real AI requests:

    python -m pytest tests/test_ai_insights.py -q
    python -m pytest -q

No database migration is needed for AI Insights. With DATABASE_URL absent,
FundHaven continues using SQLite. PostgreSQL and Brevo remain separate.
