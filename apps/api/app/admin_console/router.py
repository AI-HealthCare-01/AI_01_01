from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from .deps import get_admin_console_store, get_verified_user_id
from .models import (
    AdminActorContext,
    AdminBaseRole,
    AdminMeResponse,
    AdminOverviewResponse,
    AdminRoleAssignRequest,
    AdminRoleListResponse,
    AdminRoleRecord,
    AdminSupportQueueResponse,
    AdminUserBanContextResponse,
    AdminUserListResponse,
    AuditLogListResponse,
    ExtensionDecisionRequest,
    ExtensionRecord,
    ExtensionRequestCreateRequest,
    ModelChangeCreateRequest,
    ModelChangeRecord,
    ModelChangeStatus,
    ModelChangeTransitionRequest,
    ModelRetrainingJobCreateRequest,
    ModelRetrainingJobRecord,
    ModelRetrainingJobTransitionRequest,
    OwnerApprovalDecisionRequest,
    OwnerApprovalObjectType,
    OwnerApprovalRecord,
    OwnerApprovalStatus,
    OwnerApprovalSubmitRequest,
    PolicyChangeRecord,
    PolicyDraftCreateRequest,
    PolicyDraftUpdateRequest,
    RestrictionActionResponse,
    RestrictionCreateRequest,
)
from .store import AdminConsoleStore

router = APIRouter(tags=["admin-console"])


def _map_store_error(error: ValueError) -> HTTPException:
    code = str(error)
    if code in {
        "target_user_not_found",
        "account_not_found",
        "policy_change_not_found",
        "model_change_not_found",
        "approval_not_found",
        "extension_not_found",
        "admin_role_not_found",
        "model_retraining_job_not_found",
    }:
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=code)

    if code == "owner_restriction_forbidden":
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=code)

    if code in {
        "invalid_policy_status",
        "invalid_model_status",
        "invalid_model_status_transition",
        "approval_not_pending",
        "policy_not_approved",
        "target_ip_required",
        "restriction_target_required",
        "invalid_retraining_job_transition",
        "invalid_retraining_range",
    }:
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=code)

    if code == "owner_seed_mismatch":
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=code)

    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=code)


def _get_actor_context(user_id: str, store: AdminConsoleStore) -> AdminActorContext:
    try:
        return store.get_actor_context(user_id)
    except ValueError as error:
        if str(error) == "admin_role_not_assigned":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="admin_role_not_assigned",
            ) from error
        raise _map_store_error(error) from error


def _ensure_admin_support_or_higher(actor: AdminActorContext) -> None:
    if actor.base_role in {AdminBaseRole.owner, AdminBaseRole.admin, AdminBaseRole.support}:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin_console_forbidden")


def _ensure_admin_or_owner(actor: AdminActorContext) -> None:
    if actor.base_role in {AdminBaseRole.owner, AdminBaseRole.admin}:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin_or_owner_required")


def _ensure_owner(actor: AdminActorContext) -> None:
    if actor.base_role == AdminBaseRole.owner:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="owner_required")


def _ensure_model_editor(actor: AdminActorContext) -> None:
    if actor.base_role in {AdminBaseRole.owner, AdminBaseRole.admin}:
        return
    if actor.base_role == AdminBaseRole.support and actor.has_analyst_ml_extension:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="model_editor_permission_required",
    )


@router.get("/v1/admin/me", response_model=AdminMeResponse)
def get_admin_me(
    request: Request,
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> AdminMeResponse:
    actor = _get_actor_context(user_id, store)
    client_ip = request.headers.get("x-client-ip") or (
        request.client.host if request.client else None
    )
    store.record_login_event(user_id=user_id, ip_address=client_ip)
    return store.get_me(actor)


@router.get("/v1/admin/overview", response_model=AdminOverviewResponse)
def get_admin_overview(
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> AdminOverviewResponse:
    actor = _get_actor_context(user_id, store)
    _ensure_admin_support_or_higher(actor)
    return store.get_overview()


@router.get("/v1/admin/users", response_model=AdminUserListResponse)
def list_admin_users(
    q: str | None = None,
    limit: int = Query(default=30, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> AdminUserListResponse:
    actor = _get_actor_context(user_id, store)
    _ensure_admin_support_or_higher(actor)
    return store.list_users(q=q, limit=limit)


@router.get(
    "/v1/admin/users/{target_user_id}/ban-context",
    response_model=AdminUserBanContextResponse,
)
def get_user_ban_context(
    target_user_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> AdminUserBanContextResponse:
    actor = _get_actor_context(user_id, store)
    _ensure_admin_or_owner(actor)
    try:
        return store.get_user_ban_context(actor, target_user_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/admin/restrictions", response_model=RestrictionActionResponse)
def create_restriction_action(
    payload: RestrictionCreateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> RestrictionActionResponse:
    actor = _get_actor_context(user_id, store)
    _ensure_admin_or_owner(actor)
    try:
        return store.create_restriction(actor, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/admin/support/queue", response_model=AdminSupportQueueResponse)
def list_admin_support_queue(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=30, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> AdminSupportQueueResponse:
    actor = _get_actor_context(user_id, store)
    _ensure_admin_support_or_higher(actor)
    return store.list_support_queue_tickets(status_filter=status_filter, limit=limit)


@router.post("/v1/admin/policies", response_model=PolicyChangeRecord)
def create_policy_draft(
    payload: PolicyDraftCreateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> PolicyChangeRecord:
    actor = _get_actor_context(user_id, store)
    _ensure_admin_or_owner(actor)
    try:
        return store.create_policy_draft(actor, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.patch("/v1/admin/policies/{policy_change_id}", response_model=PolicyChangeRecord)
def patch_policy_draft(
    policy_change_id: str,
    payload: PolicyDraftUpdateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> PolicyChangeRecord:
    actor = _get_actor_context(user_id, store)
    _ensure_admin_or_owner(actor)
    try:
        return store.update_policy_draft(actor, policy_change_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/admin/policies", response_model=list[PolicyChangeRecord])
def list_policy_drafts(
    limit: int = Query(default=50, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> list[PolicyChangeRecord]:
    actor = _get_actor_context(user_id, store)
    _ensure_admin_or_owner(actor)
    return store.list_policy_changes(limit)


@router.post("/v1/admin/policies/{policy_change_id}/apply", response_model=PolicyChangeRecord)
def apply_policy(
    policy_change_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> PolicyChangeRecord:
    actor = _get_actor_context(user_id, store)
    _ensure_owner(actor)
    try:
        return store.apply_policy_change(actor, policy_change_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/admin/model-ops", response_model=ModelChangeRecord)
def create_model_change(
    payload: ModelChangeCreateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> ModelChangeRecord:
    actor = _get_actor_context(user_id, store)
    _ensure_model_editor(actor)
    try:
        return store.create_model_change(actor, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/admin/model-ops", response_model=list[ModelChangeRecord])
def list_model_changes(
    limit: int = Query(default=50, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> list[ModelChangeRecord]:
    actor = _get_actor_context(user_id, store)
    _ensure_model_editor(actor)
    return store.list_model_changes(limit)


@router.post("/v1/admin/model-ops/{model_change_id}/transition", response_model=ModelChangeRecord)
def transition_model_change(
    model_change_id: str,
    payload: ModelChangeTransitionRequest,
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> ModelChangeRecord:
    actor = _get_actor_context(user_id, store)

    if payload.next_status in {
        ModelChangeStatus.deployed,
        ModelChangeStatus.rolled_back,
    }:
        _ensure_owner(actor)
    else:
        _ensure_model_editor(actor)

    try:
        return store.transition_model_change(actor, model_change_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post(
    "/v1/admin/model-ops/{model_change_id}/retraining-jobs",
    response_model=ModelRetrainingJobRecord,
)
def create_model_retraining_job(
    model_change_id: str,
    payload: ModelRetrainingJobCreateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> ModelRetrainingJobRecord:
    actor = _get_actor_context(user_id, store)
    _ensure_model_editor(actor)
    try:
        return store.create_model_retraining_job(actor, model_change_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get(
    "/v1/admin/model-ops/{model_change_id}/retraining-jobs",
    response_model=list[ModelRetrainingJobRecord],
)
def list_model_retraining_jobs(
    model_change_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> list[ModelRetrainingJobRecord]:
    actor = _get_actor_context(user_id, store)
    _ensure_model_editor(actor)
    return store.list_model_retraining_jobs(model_change_id, limit)


@router.post(
    "/v1/admin/model-ops/retraining-jobs/{job_id}/transition",
    response_model=ModelRetrainingJobRecord,
)
def transition_model_retraining_job(
    job_id: str,
    payload: ModelRetrainingJobTransitionRequest,
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> ModelRetrainingJobRecord:
    actor = _get_actor_context(user_id, store)
    _ensure_admin_or_owner(actor)
    try:
        return store.transition_model_retraining_job(actor, job_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/admin/owner-approval", response_model=OwnerApprovalRecord)
def submit_owner_approval(
    payload: OwnerApprovalSubmitRequest,
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> OwnerApprovalRecord:
    actor = _get_actor_context(user_id, store)
    if payload.object_type == OwnerApprovalObjectType.policy_change:
        _ensure_admin_or_owner(actor)
    else:
        _ensure_model_editor(actor)

    try:
        return store.submit_owner_approval(actor, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/admin/owner-approval", response_model=list[OwnerApprovalRecord])
def list_owner_approvals(
    status_filter: OwnerApprovalStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> list[OwnerApprovalRecord]:
    actor = _get_actor_context(user_id, store)
    _ensure_admin_or_owner(actor)
    return store.list_owner_approvals(status_filter, limit)


@router.post(
    "/v1/admin/owner-approval/{approval_id}/decide",
    response_model=OwnerApprovalRecord,
)
def decide_owner_approval(
    approval_id: str,
    payload: OwnerApprovalDecisionRequest,
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> OwnerApprovalRecord:
    actor = _get_actor_context(user_id, store)
    _ensure_owner(actor)
    try:
        return store.decide_owner_approval(actor, approval_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/admin/extensions/request", response_model=ExtensionRecord)
def request_support_extension(
    payload: ExtensionRequestCreateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> ExtensionRecord:
    actor = _get_actor_context(user_id, store)
    if actor.base_role != AdminBaseRole.support:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="support_role_required")

    try:
        return store.create_extension_request(actor, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/admin/extensions", response_model=list[ExtensionRecord])
def list_support_extensions(
    limit: int = Query(default=50, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> list[ExtensionRecord]:
    actor = _get_actor_context(user_id, store)
    _ensure_admin_or_owner(actor)
    return store.list_extensions(limit)


@router.post("/v1/admin/extensions/{extension_id}/decide", response_model=ExtensionRecord)
def decide_support_extension(
    extension_id: str,
    payload: ExtensionDecisionRequest,
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> ExtensionRecord:
    actor = _get_actor_context(user_id, store)
    _ensure_admin_or_owner(actor)
    try:
        return store.decide_extension_request(actor, extension_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/admin/roles", response_model=AdminRoleListResponse)
def list_admin_roles(
    limit: int = Query(default=100, ge=1, le=200),
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> AdminRoleListResponse:
    actor = _get_actor_context(user_id, store)
    _ensure_admin_or_owner(actor)
    return store.list_admin_roles(limit)


@router.post("/v1/admin/roles/{target_user_id}", response_model=AdminRoleRecord)
def set_admin_role(
    target_user_id: str,
    payload: AdminRoleAssignRequest,
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> AdminRoleRecord:
    actor = _get_actor_context(user_id, store)
    _ensure_owner(actor)
    try:
        return store.set_admin_role(actor, target_user_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/admin/audit-log", response_model=AuditLogListResponse)
def list_audit_logs(
    limit: int = Query(default=100, ge=1, le=200),
    user_id: str = Depends(get_verified_user_id),
    store: AdminConsoleStore = Depends(get_admin_console_store),
) -> AuditLogListResponse:
    actor = _get_actor_context(user_id, store)
    _ensure_admin_support_or_higher(actor)
    return store.list_audit_logs(actor, limit)
