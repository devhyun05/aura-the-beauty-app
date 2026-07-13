/* The blue React Native refresh banner obscures real UI on physical devices.
 * Keep Fast Refresh and error banners, but suppress only the transient refresh banner.
 */
if (__DEV__) {
  const DevLoadingView = require('react-native/Libraries/Utilities/DevLoadingView').default;
  const showMessage = DevLoadingView.showMessage.bind(DevLoadingView);
  DevLoadingView.hide();
  DevLoadingView.showMessage = (message, type, options) => {
    if (type !== 'refresh') showMessage(message, type, options);
  };
}
