import asyncio

import jwt


class EntraAuth:
    def __init__(self, tenant_id: str, client_id: str):
        self.tenant_id, self.client_id = tenant_id, client_id
        self.keys = jwt.PyJWKClient(
            f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys"
        )

    async def validate(self, header: str | None):
        if not header or not header.startswith("Bearer "):
            raise ValueError("Bearer authentication required")
        token = header[7:]
        key = await asyncio.to_thread(self.keys.get_signing_key_from_jwt, token)
        claims = jwt.decode(
            token,
            key.key,
            algorithms=["RS256"],
            audience=self.client_id,
            issuer=f"https://login.microsoftonline.com/{self.tenant_id}/v2.0",
            options={"require": ["exp", "iat", "iss", "aud", "tid"]},
        )
        if claims["tid"] != self.tenant_id or "access_as_user" not in claims.get("scp", "").split():
            raise ValueError("Root Cause API delegated scope required")
        return claims
