"use client"

import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import {
  EntityCatalogSection,
  type EntityCatalogSectionProps,
} from "@/components/settings/entity-catalog-section"

export interface EntityCatalogPageProps extends EntityCatalogSectionProps {}

export function EntityCatalogPage(props: EntityCatalogPageProps) {
  return (
    <SettingsPageLayout title={props.title}>
      <EntityCatalogSection {...props} />
    </SettingsPageLayout>
  )
}
