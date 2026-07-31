import type { ModelEntity, ModelVersionEntity } from './model.entities'
import type { ModelDetailDto, ModelDto, ModelVersionDto, ModelWithLatestVersionDto } from './model.types'

export const toVersionDto = (v: ModelVersionEntity): ModelVersionDto => ({
  id: v.id,
  modelId: v.modelId,
  versionNumber: v.versionNumber,
  versionLabel: v.versionLabel,
  status: v.status,
  originalFilename: v.originalFilename,
  extension: v.extension,
  sizeBytes: v.sizeBytes,
  sha256: v.sha256,
  md5: v.md5,
  virusScan: v.virusScan,
  virusScanDetail: v.virusScanDetail,
  metadata: v.metadata ? (v.metadata as Record<string, unknown>) : null,
  uploadedAt: v.uploadedAt.toISOString(),
  deletedAt: v.deletedAt?.toISOString() ?? null,
  createdAt: v.createdAt.toISOString(),
  updatedAt: v.updatedAt.toISOString(),
})

export const toModelDto = (m: ModelEntity): ModelDto => ({
  id: m.id,
  ownerId: m.ownerId,
  name: m.name,
  description: m.description,
  framework: m.framework,
  tags: m.tags,
  status: m.status,
  versionCount: m.versionCount,
  latestVersionId: m.latestVersionId,
  createdAt: m.createdAt.toISOString(),
  updatedAt: m.updatedAt.toISOString(),
})

export const toModelWithLatestVersionDto = (
  m: ModelEntity,
  latest: ModelVersionEntity | null,
): ModelWithLatestVersionDto => ({
  ...toModelDto(m),
  latestVersion: latest ? toVersionDto(latest) : null,
})

export const toModelDetailDto = (
  m: ModelEntity,
  versions: ModelVersionEntity[],
): ModelDetailDto => ({
  ...toModelDto(m),
  versions: versions.map(toVersionDto),
})
