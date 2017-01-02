/**
 * Listens for the app launching then creates the window
 *
 * @see http://developer.chrome.com/apps/app.window.html
 * @TODO Add the listener for the event triggered by a the file handler.
 */
chrome.app.runtime.onLaunched.addListener(function() {
	chrome.app.window.create('index.html', {
		id: 'main',
		bounds: {
			width: 800,
			height: 600
		},
		minWidth: 450,
		minHeight: 600
	});
});