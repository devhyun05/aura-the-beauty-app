from __future__ import annotations

import asyncio
import hashlib
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError, UnauthorizedSSOTokenError

from app.core.errors import AppError
from app.core.settings import Settings


class ChimeMeetingsService:
  def __init__(self, settings: Settings) -> None:
    self.settings = settings
    self._chime_client_cached = None

  def _client(self):
    if self._chime_client_cached is not None:
      return self._chime_client_cached

    region = self.settings.effective_chime_region
    client_kwargs = {
      "config": Config(retries={"max_attempts": 3, "mode": "standard"}),
      "endpoint_url": f"https://meetings-chime.{region}.amazonaws.com",
      "region_name": region,
    }

    if self.settings.aws_profile_name:
      self._chime_client_cached = boto3.Session(profile_name=self.settings.aws_profile_name).client("chime-sdk-meetings", **client_kwargs)
      return self._chime_client_cached

    if (
      self.settings.aws_access_key_id
      and self.settings.aws_secret_access_key
      and not self.settings.aws_use_iam_role
    ):
      client_kwargs.update(
        {
          "aws_access_key_id": self.settings.aws_access_key_id,
          "aws_secret_access_key": self.settings.aws_secret_access_key,
        },
      )

    self._chime_client_cached = boto3.client("chime-sdk-meetings", **client_kwargs)
    return self._chime_client_cached

  async def _call_aws(self, operation, *args, error_code: str, error_message: str, **kwargs):
    try:
      return await asyncio.to_thread(operation, *args, **kwargs)
    except ClientError as error:
      aws_code = str(error.response.get("Error", {}).get("Code") or "ClientError")
      if aws_code in {"AccessDenied", "AccessDeniedException", "UnauthorizedOperation"}:
        raise AppError(
          502,
          "CHIME_AWS_ACCESS_DENIED",
          "AWS Chime 권한이 없어 화상상담 미팅을 만들 수 없습니다.",
          {"awsCode": aws_code},
        ) from error
      raise AppError(502, error_code, error_message, {"awsCode": aws_code}) from error
    except UnauthorizedSSOTokenError as error:
      raise AppError(
        502,
        "CHIME_AWS_SESSION_EXPIRED",
        "AWS 로그인 세션이 만료되었습니다. 서버에서 AWS SSO 로그인을 다시 진행해 주세요.",
        {"awsCode": type(error).__name__},
      ) from error
    except BotoCoreError as error:
      raise AppError(502, error_code, error_message, {"awsCode": type(error).__name__}) from error

  @staticmethod
  def _client_request_token(external_meeting_id: str) -> str:
    digest = hashlib.sha256(external_meeting_id.encode("utf-8")).hexdigest()
    return f"consulting-{digest}"[:64]

  async def create_meeting(self, *, external_meeting_id: str) -> dict:
    if not self.settings.chime_enabled:
      raise AppError(503, "CHIME_NOT_ENABLED", "화상상담 서버 설정이 아직 켜져 있지 않습니다.")

    response = await self._call_aws(
      self._client().create_meeting,
      ClientRequestToken=self._client_request_token(external_meeting_id),
      ExternalMeetingId=external_meeting_id[:64],
      MediaRegion=self.settings.effective_chime_media_region,
      error_code="CHIME_MEETING_CREATE_FAILED",
      error_message="Chime 미팅 생성에 실패했습니다.",
    )
    return response["Meeting"]

  async def get_meeting(self, *, meeting_id: str) -> dict:
    response = await self._call_aws(
      self._client().get_meeting,
      MeetingId=meeting_id,
      error_code="CHIME_MEETING_GET_FAILED",
      error_message="Chime 미팅 정보를 가져오지 못했습니다.",
    )
    return response["Meeting"]

  async def create_attendee(self, *, meeting_id: str, external_user_id: str) -> dict:
    response = await self._call_aws(
      self._client().create_attendee,
      MeetingId=meeting_id,
      ExternalUserId=external_user_id[:64],
      error_code="CHIME_ATTENDEE_CREATE_FAILED",
      error_message="Chime 참가자 생성에 실패했습니다.",
    )
    return response["Attendee"]

  async def delete_meeting(self, *, meeting_id: str) -> None:
    await self._call_aws(
      self._client().delete_meeting,
      MeetingId=meeting_id,
      error_code="CHIME_MEETING_END_FAILED",
      error_message="Chime 미팅 종료에 실패했습니다.",
    )
