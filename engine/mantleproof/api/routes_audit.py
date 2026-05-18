"""SCAFFOLD route — implement in T21."""

from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/api/audit/{address}")
async def get_audit(address: str) -> dict:
    raise HTTPException(status_code=501, detail="SCAFFOLD: not implemented (T21)")
