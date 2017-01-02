/**
 * Provides Skrifa's configuration.
 *
 * This file contains the initial configurations,
 * note colors and database information.
 */
MathJax.Hub.Config({
	tex2jax: {inlineMath: [['$','$'], ['\\(','\\)']]}
});

var storage = chrome.localStorage;

var id, view, deltempid, notebook = "Inbox", dragging = null, dragTarget = null;

var colors = ["#F06868", "#80D6FF", "#FAB57A", "#41B3D3", "#61D2DC", "#444444", "#63B75D", "#217756", "#118DF0", "#FF304F", "#B7569A",
				"#883C82", "#FFBF00", "#2E3837", "#166678", "#7DB9B3", "#76E7C7", "#F26BA3", "#165570", "#FF9F55", "#35A3C5", "#FC9C00",
				"#ED5784", "#C93746", "#9A30DD", "#01C2D6", "#46BEAD", "#3AB4B1", "#F7941D", "#F24D16", "#C92E00", "#A81414", "#E55942",
				"#FF7085", "#4ED887", "#0086B3"];

var db = new Dexie("Papyrus");

db.version(1).stores({
	notes: "++id, Title, Content, CDate, MDate, Color"
});

db.version(2).stores({
	notes: "++id, Title, Content, CDate, MDate, Color, Notebook",
	notebooks: "++id, Name, Description"
}).upgrade (function (trans) {
      trans.notes.toCollection().modify (function (note) {
          note.Notebook = "Inbox";
      });
  });
