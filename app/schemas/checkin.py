from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CheckinResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    message: str
    disclaimer: str
    timestamp: datetime
