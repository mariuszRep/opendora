import { lazy } from "@opendora/util/lazy"
import { PermissionNext } from "@opendora/permission/next"

export const PermissionRoutes = lazy(() => PermissionNext.getRouter())
