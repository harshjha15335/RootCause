import uvicorn
from dotenv import load_dotenv

from api.telemetry import configure

if __name__ == "__main__":
    load_dotenv(override=False)
    configure()
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000)
