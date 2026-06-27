import { lazy } from "@projectflows/util/lazy"
import { PermissionNext } from "@projectflows/permission/next"

export const PermissionRoutes = lazy(() => PermissionNext.getRouter())
