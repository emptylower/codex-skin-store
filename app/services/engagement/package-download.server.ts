/**
 * Route-facing package download facade.
 * Routes must not import ~/platform/cloudflare/**.
 */
import {
  createR2PackageStore,
  streamPackageDownload as streamFromStore,
} from "~/platform/cloudflare/package-download.server";

export async function streamThemePackage(input: {
  packages: R2Bucket;
  packageKey: string;
  slug: string;
  request: Request;
}): Promise<Response> {
  return streamFromStore({
    store: createR2PackageStore(input.packages),
    packageKey: input.packageKey,
    slug: input.slug,
    request: input.request,
  });
}
