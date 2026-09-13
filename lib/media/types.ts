/** Serialisable media asset for client components (admin library, picker, CMS fields). */
export interface MediaAssetDTO {
  id: string;
  kind: "image" | "video" | "file";
  folderId: string | null;
  filename: string;
  title: string | null;
  alt: string | null;
  caption: string | null;
  tags: string[];
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  storage: "local" | "bunny";
  url: string;
  thumbUrl: string | null;
  blur: string | null;
  focalX: number;
  focalY: number;
  createdAt: string;
  updatedAt: string;
}

export interface MediaFolderDTO {
  id: string;
  name: string;
  parentId: string | null;
  count: number;
}

export type MediaKind = MediaAssetDTO["kind"];
