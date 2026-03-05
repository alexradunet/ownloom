# Tool API Migration (March 2026)

This release removes old tool names with no compatibility aliases.

## Service Tools

- `service_scaffold` -> `svc_scaffold`
- `service_publish` -> `svc_publish`
- `service_install` -> `svc_install`
- `service_test` -> `svc_test`

## OS Tools

- `bootc_status` -> `os_bootc_status`
- `bootc_update` -> `os_bootc_update`
- `bootc_rollback` -> `os_bootc_rollback`
- `container_status` -> `os_container_status`
- `container_logs` -> `os_container_logs`
- `systemd_control` -> `os_systemd_control`
- `container_deploy` -> `os_container_deploy`
- `update_status` -> `os_update_status`
- `schedule_reboot` -> `os_schedule_reboot`
- `system_health` -> `os_system_health`

## Fleet Tools

- `bloom_repo_configure` -> `fleet_repo_configure`
- `bloom_repo_sync` -> `fleet_repo_sync`
- `bloom_repo_submit_pr` -> `fleet_repo_submit_pr`
- `bloom_repo_status` -> `fleet_repo_status`

## Runtime Tools

- `manifest_show` -> `runtime_manifest_show`
- `manifest_sync` -> `runtime_manifest_sync`
- `manifest_set_service` -> `runtime_manifest_set_service`
- `manifest_apply` -> `runtime_manifest_apply`
