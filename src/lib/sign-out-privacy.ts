/** Stop browser push delivery before ending the session on a shared device. */
export async function clearBrowserNotifications(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  // Unlike serviceWorker.ready, this does not wait when no worker exists.
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return;
  const subscription = await registration.pushManager?.getSubscription();
  if (subscription) {
    const removed = await subscription.unsubscribe();
    if (!removed && (await registration.pushManager.getSubscription())) {
      throw new Error("Could not disable this browser's notifications.");
    }
  }
  for (const notification of await registration.getNotifications()) {
    notification.close();
  }
}
