type RestoreSubscriptionAccessOptions = {
  isPlayStoreBuild: boolean;
  restoreGooglePlay: () => Promise<void>;
  refreshExternalAccess: () => Promise<void>;
};

export async function restoreSubscriptionAccess({
  isPlayStoreBuild,
  restoreGooglePlay,
  refreshExternalAccess,
}: RestoreSubscriptionAccessOptions) {
  if (isPlayStoreBuild) {
    await restoreGooglePlay();
    return;
  }
  await refreshExternalAccess();
}
