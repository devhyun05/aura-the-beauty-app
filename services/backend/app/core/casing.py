from collections.abc import Mapping, Sequence
from typing import Any


def to_camel(value: str) -> str:
  parts = value.split("_")

  if not parts:
    return value

  return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


def camelize(value: Any) -> Any:
  if isinstance(value, Mapping):
    return {to_camel(str(key)): camelize(item) for key, item in value.items()}

  if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
    return [camelize(item) for item in value]

  return value
