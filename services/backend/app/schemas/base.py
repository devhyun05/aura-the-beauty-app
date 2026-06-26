from pydantic import BaseModel, ConfigDict


class CamelModel(BaseModel):
  model_config = ConfigDict(populate_by_name=True, extra="ignore")
