import { lazy } from "@opendora/util/lazy"
import { PermissionNext } from "@opendora/opencode/permission/next"

export const PermissionRoutes = lazy(() => PermissionNext.getRouter())
