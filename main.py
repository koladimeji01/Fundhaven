"""Convenient local entry point for the FundHaven FastAPI application.

The legacy interactive CLI is retired because it could create accounts without
credentials. Run `python main.py` or `uvicorn api:app --reload` locally.
"""

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api:app", host="127.0.0.1", port=8000)
