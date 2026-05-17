import { lazy } from "../../util/lazy"
import { PermissionNext } from "@/permission/next"

export const PermissionRoutes = lazy(() => PermissionNext.getRouter())
