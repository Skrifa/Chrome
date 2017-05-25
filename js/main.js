/**
 * Provides Skrifa's functionality.
 *
 * This file contains all the event handlers, editing functions,
 * exporting and importing functions as well as the required
 * database operations .
 */

$(document).ready(function(){
	// Open the Database
	db.open();

	/*
		Set Initial Settings
	*/

	// Set the notes display mode according to the user's saved settings
	chrome.storage.sync.get("view", function(item) {
		if(item["view"] != null && item["view"] != ""){
			$(".note-container").addClass(item["view"]);
			if(item["view"] == "list"){
				$("span[data-action='change-view']").removeClass("fa-th-list");
				$("span[data-action='change-view']").addClass("fa-th");
			}

		}else{
			$(".note-container").addClass("grid");
		}
    });

    // Set night mode according to the user's saved settings
    chrome.storage.sync.get("mode", function(item) {
		if(item["mode"] != null && item["mode"] != ""){
			if(item["mode"] == "dark"){
				$("body").removeClass("light");
				$("body").addClass("dark");
				$("span[data-action='set-mode']").removeClass("fa-moon-o");
				$("span[data-action='set-mode']").addClass("fa-sun-o");
			}
		}
    });

    /*
	    Choose File Functions
    */

	// Choose/Create the file to save the backup on
	function chooseRestore(){
		chrome.fileSystem.chooseEntry({
				type: 'openFile',
				accepts: [{ description: 'Skrifa Backup files (*.skrup)',
				extensions: ['skrup']}]
			},
			function(readOnlyEntry) {
				readOnlyEntry.file(function(file) {
					var reader = new FileReader();
					reader.onloadend = function(e) {
						$(".restore-backup textarea").val(e.target.result);
						$(".restore-confirmation").addClass("active");
					};
					reader.readAsText(file)
				});
			}
		);
	}

	function chooseNoteToImport(){
		chrome.fileSystem.chooseEntry({
				type: 'openFile',
				accepts: [{description: 'Skrifa, Markdown files (*.skrifa, *.md)',
				extensions: ['skrifa', 'md']}]
			},
			function(readOnlyEntry) {

			readOnlyEntry.file(function(file) {
				var reader = new FileReader();
				var extension = file.name.split(".").slice(-1)[0];
				reader.onloadend = function(e) {
					switch (extension) {
						case "skrifa":
							var json = JSON.parse(e.target.result);
							if(json.Title && json.Content && json.Color){
								if (json.CDate && json.MDate) {
									json.CreationDate = json.CDate;
									json.ModificationDate = json.MDate;
								}
								db.notes.add({Title: json.Title, Content: json.Content, CreationDate: json.CreationDate, ModificationDate: json.ModificationDate, SyncDate: "", Color: json.Color, Notebook: notebook});
								loadNotes();
							}
							break;

						case "md":
							var md = window.markdownit();
							var html = md.render(e.target.result);
							var date = new Date().toString();
							var h1 = $(html).filter("h1").text().trim();
							h1 = h1 != "" ? h1: 'New Note';
							if(h1 && html && date){
								db.notes.add({Title: h1, Content: html, CreationDate: date, ModificationDate: date, SyncDate: "", Color: colors[Math.floor(Math.random()*colors.length)], Notebook: notebook});

								loadNotes();
							}
							break;
					}
					$(".import-note").removeClass("active");
				};
				reader.readAsText(file)
			});
		});
	}

	/*
		Write To File Entry
	*/

	// Writes the given contents to a given fileEntry
	function writeToEntry(fileEntry, contents){

		fileEntry.createWriter(function(fileWriter) {

			var truncated = false;
			var blob = new Blob([contents]);

			fileWriter.onwriteend = function(e) {
				if (!truncated) {
					truncated = true;
					this.truncate(blob.size);
					return;
				}
			};

			fileWriter.onerror = function(e) {
				console.log('Write failed: '+ e.toString());
			};

			fileWriter.write(blob);

		});
	}

	/*
		Content Export Functions
	*/

	// Generates the backup content and exports it.
	function exportToFileEntry(fileEntry){
		var json = {
			version: 3,
			notebooks: {

			}
		};

		json.notebooks["Inbox"] = {
			id: "Inbox",
			Name: "Inbox",
			Description: "A place for any note",
			notes: []
		}

		db.transaction('r', db.notes, db.notebooks, function() {

			db.notes.where('Notebook').equals("Inbox").each(function(item, cursor){
				json.notebooks["Inbox"].notes.push({
					Title: item.Title,
					Content: item.Content,
					CreationDate: item.CreationDate,
					ModificationDate: item.ModificationDate,
					SyncDate: item.SyncDate,
					Color: item.Color,
					Notebook: item.Notebook,
				});
			});

			db.notebooks.each(function(item, cursor){
				json.notebooks[item.id] = {
					id: item.id,
					Name: item.Name,
					Description: item.Description,
					notes: []
				};

				db.notes.where('Notebook').equals('' + item.id).each(function(item2, cursor2){
					json.notebooks[item.id].notes.push({
						Title: item2.Title,
						Content: item2.Content,
						CreationDate: item2.CreationDate,
						ModificationDate: item2.ModificationDate,
						SyncDate: item2.SyncDate,
						Color: item2.Color,
						Notebook: item2.Notebook,
					});
				});
			})

		}).then(function(){
			writeToEntry(fileEntry, JSON.stringify(json));
		});
    }

	function exportNoteToFile(fileEntry, format){
		var content = "";
		db.notes.where("id").equals(view).first(function(note){
			switch(format){
				case "Skrifa":
					content = JSON.stringify(note);
					break;

				case "Markdown":
					var und = new upndown();
					content = note.Content.replace(/(?:\r\n|\r|\n)/g, '');
					und.convert(content, function(error, markdown){
						if(error){
							console.err(error);
						}else{
							writeToEntry(fileEntry, markdown);
						}
					});
					break;

				case "HTML":
					content = cleanHTML(note.Content).replace(/(?:\r\n|\r|\n)/g, '');
					break;
			}
            writeToEntry(fileEntry, content);
        });
	}

    // Converts from Skrifa format to HTML and exports it.
    function exportToHTMLFileEntry(fileEntry){
        db.notes.where("id").equals(view).first(function(note){
            var content = cleanHTML(note.Content).replace(/(?:\r\n|\r|\n)/g, '');
            writeToEntry(fileEntry, content);
        });
    }

	// Converts from Skrifa format to Markdown and exports it.
	function exportToMarkdownFileEntry(fileEntry){

        db.notes.where("id").equals(view).first(function(note){
            var und = new upndown();
            var content = note.Content.replace(/(?:\r\n|\r|\n)/g, '').replace(/data-url/g, "src").replace(/class="lazy" src=/g, "");
            und.convert(content, function(error, markdown){
    			if(error){
    				console.err(error);
    			}else{
    				writeToEntry(fileEntry, markdown);
    			}
    		});
		});
	}

	// Exports the Skrifa Note
	function exportToSkrifaFileEntry(fileEntry) {
		db.notes.where("id").equals(view).first(function(note){
			var contents = JSON.stringify(note);

			writeToEntry(fileEntry, contents);
		});
	}

    // Clean the HTML code generated by the Content Editable
    function cleanHTML(html){
        return html.replace(/(<\/span>|<span style=\"line-height: 1.5em;\">)/g, '').replace(/<div>/g, '<p>').replace(/<\/div>/g, '</p>\r\n').replace(/<p><br><\/p>/g, '').replace(/&nbsp;/g, ' ');
    }

	/*
		Choose/Create Export File Functions
	*/

	// Choose or create the backup file to export to.
	function createBackupJson(){
		var date = new Date().toDateString().toLowerCase().split(' ').join('-');
		chrome.fileSystem.chooseEntry( {
		type: 'saveFile',
		suggestedName: 'Skrifa Chrome Backup '+date+'.skrup',
		accepts: [ { description: 'Skrifa Backup files (*.skrup)',
			extensions: ['skrup']} ],
		acceptsAllTypes: true
		}, exportToFileEntry);
	}

	function exportNote(extension, extensionName, exportFunction){
		var title = $("#view h1").first().text().trim();
		if(title == ""){
			title = "Untitled";
		}
		chrome.fileSystem.chooseEntry( {
			type: 'saveFile',
			suggestedName: title + '.' + extension,
			accepts: [ { description: extensionName + ' files (*.' + extension + ')',
			 	extensions: [extension]} ],
			acceptsAllTypes: true
		}, exportFunction);
	}
	/*
		Skrifa Functions
	*/

	// Takes the given backup data and restores the notes from it.
	function restoreFromBackup(data){
		var data = JSON.parse(data);
		if (typeof data.Version == 'undefined' && typeof data.version != 'undefined') {
			data.Version = data.version;
		}
		var version = data.Version;

		switch (version) {
			case 3:
				db.transaction('rw', db.notes, db.notebooks, function() {
					db.notebooks.clear().then(function(deleteCount){
						db.notes.clear().then(function(deleteCount){

							for(var i in data.notebooks){
								if(data.notebooks[i].id != "Inbox"){
									db.notebooks.add({
										id: data.notebooks[i].id,
										Name: data.notebooks[i].Name,
										Description: data.notebooks[i].Description
									});
								}
								for(var j in data.notebooks[i].notes){
									db.notes.add(data.notebooks[i].notes[j]);
								}
							}
						});
					});
				}).then(function(){
					loadNotes();
				})
				break;
			case 2:
				db.notebooks.clear().then(function(deleteCount){
					for(var i in data.Notebooks){
						data.Notebooks[i].id = parseInt(data.Notebooks[i].id);
						db.notebooks.add(data.Notebooks[i]);
					}
					loadNotebooks();
				});

				db.notes.clear().then(function(deleteCount){
					for(var i in data.Notes){
						data.Notes[i].id = parseInt(data.Notes[i].id);
						db.notes.add(data.Notes[i]);
					}
					loadNotes();
				});
				break;
			default:
				db.notes.clear().then(function(deleteCount){
					for(var i in data){
						data[i].id = parseInt(data[i].id);
						data[i].Notebook = "Inbox";
						db.notes.add(data[i]);
					}
					loadNotes();
					$(".restore-backup").removeClass("active");
					$(".restore-confirmation").removeClass("active");
					$(".restore-backup textarea").val("");
				});
				break;
		}

		$(".restore-backup").removeClass("active");
		$(".restore-confirmation").removeClass("active");
		$(".restore-backup textarea").val("");
	}

	// Loads the notes from the database and displays them.
	function loadNotes(){
		$(".note-container").html("");
		$(".welcome").hide();
		db.transaction('r', db.notes, function() {
			var ht = "";
			db.notes.where("Notebook").equals(notebook).count(function(count){
				if(count <= 0){
					$(".welcome").show();
				}
			});
			db.notes.where("Notebook").equals(notebook).each(function(item, cursor){
				var content = item.Content;
				if(item.Title != "Untitled"){
					try{
						content = content.replace("<h1>" + item.Title + "</h1>", "").replace(/(<([^>]+)>)/ig, "");
					}catch(e){
						console.log(e);
					}
				}else{
					content = content.replace(/(<([^>]+)>)/ig, "");
				}

				content = content.length >= 40 ? content.substring(0, 40) : content.substring(0, content.length);

				$(".note-container").append("<article data-color='" + item.Color + "' draggable='true' data-nid='"+item.id+"'><div class='content' ><h2>" + item.Title + "</h2><span>" + content + "</span></div><div class='note-actions'><span class='fa fa-eye' data-view='" + item.id + "'></span><span class='fa-pencil fa' data-note-id='"+item.id+"' data-action='edit'></span><span class='fa-trash fa' data-note-id='"+item.id+"' data-action='delete'></span></div></article>");

				$(".list article").each(function(){
					$(this).css("border-color", $(this).data("color"));
				});

				$(".grid article").each(function(){
					$(this).css("background", $(this).data("color"));
				});
			});
			$(".note-container").append("<button class='fa fa-upload' data-action='import-note' title='Import Note'></button>");
			$(".note-container").append("<button class='fa fa-plus' data-action='new' title='New Note'></button>");

		});
	}

	$(".notebooks-list").on("dragover", " button", function(event) {
	    event.preventDefault();
	    event.stopPropagation();
		$(this).addClass("drag-hover");
	});

	$(".notebooks-list").on("dragleave", " button", function(event) {
	    event.preventDefault();
	    event.stopPropagation();
		$(this).removeClass("drag-hover");
	});

	$(".note-container").on("drag", "article", function(event) {
	    event.preventDefault();
	    event.stopPropagation();
		dragging = event.currentTarget.dataset.nid;
	});

	$(".notebooks-list").on("drop", " button" ,function(event) {
	    event.preventDefault();
	    event.stopPropagation();
		dragTarget = event.target.dataset.notebook;
		$(this).removeClass("drag-hover");

		db.transaction('rw', db.notes, function() {
			db.notes.where("id").equals(parseInt(dragging)).modify({Notebook: dragTarget});
			dragging = null;
			dragTarget = null;
			loadNotes();
		});

	});

	function loadNotebooks(){
		$(".notebooks-list").html("");
		$(".notebooks-list").append('<button data-notebook="Inbox">Inbox</button>');
		db.transaction('r', db.notebooks, function() {
			db.notebooks.each(function(item, cursor){
				$(".notebooks-list").append('<button data-notebook="' + item.id + '">' + item.Name + '</button>');
			});
		});
	}

	// Gets the BLOB of the image from a url and returns the URL object.
	function getImageUrl(element){
		var xhr = new XMLHttpRequest();
		var url = element[0].dataset.url;
		xhr.open('GET', url, true);
		xhr.responseType = 'blob';
		xhr.onload = function(e) {
			element[0].setAttribute("src", window.URL.createObjectURL(this.response));
		};
		xhr.send();
	}

	// Load the Notes
	$("[data-action='edit-notebook']").hide();
	$("[data-action='delete-notebook']").hide();
	loadNotebooks();
	loadNotes();

	/*
		Notes Event Handlers
	*/

	// Loads Note into the View screen.
	$("body").on("click", "[data-view]", function(){
		view = $(this).data("view");
		db.transaction('r', db.notes, function(){
			$(".note-container").hide();
			db.notes.where("id").equals(view).first(function(note){
				$("#view").html(note.Content);
				$("#view").html($("#view").html().replace(/\[:/g, "<span class='fa fa-").replace(/:\]/g, "'></span>"));
				Prism.highlightAll(true, null);
				(function(){
					if (!self.Prism) {
						return;
					}
					Prism.hooks.add('wrap', function(env) {
						if (env.type !== "keyword") {
							return;
						}
						env.classes.push('keyword-' + env.content);
					});
				})();

				MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
				$("#view img").each(function(){
					if($(this)[0].dataset.url){
						getImageUrl($(this));
					}else{
						$(this)[0].dataset.url =  $(this).attr("src");
						getImageUrl($(this));
					}

				});
				$(".view-nav").addClass("active");
				$(".notebook-nav").removeClass("active");
				$("#view").show();
				$("nav").hide();
				$(".lazy").lazyload();
				$('.video-wrapper').fitVids();
			});
			$("#editor").hide();
		});
	});

	// Searches on the database for a note that matches the search string.
	$(".notebook-nav input").on("keyup", function(){
		if($(".notebook-nav input").val().trim() != ""){

			$(".note-container").html("");
			db.transaction('r', db.notes, function(){
				db.notes.where("Notebook").equals(notebook).each(function(item, cursor){
					if(item.Content.toLowerCase().indexOf($(".notebook-nav input").val().toLowerCase()) > -1){
						var content = item.Content;
						if(item.Title != "Untitled"){
							try{
								content = content.replace("<h1>" + item.Title + "</h1>", "").replace(/(<([^>]+)>)/ig, "");
							}catch(e){
								console.log(e);
							}
						}else{
							content = content.replace(/(<([^>]+)>)/ig, "");
						}
						if(content.length >= 40){
							content = content.substring(0, 40);
						}else{
							content = content.substring(0, content.length);
						}
						$(".note-container").append("<article data-color='" + item.Color + "' ><div class='content' data-view='" + item.id + "'><h2>" + item.Title + "</h2><span>" + content + "</span></div><div class='note-actions'><span class='fa fa-eye' data-view='" + item.id + "'></span><span class='fa-pencil fa' data-note-id='"+item.id+"' data-action='edit'></span><span class='fa-trash fa' data-note-id='"+item.id+"' data-action='delete'></span></div></article>");

						$(".list article").each(function(){
							$(this).css("border-color", $(this).data("color"));
						});

						$(".grid article").each(function(){
							$(this).css("background", $(this).data("color"));
						});
					}
				});
			});
		}else{
			$(".note-container").html("");
			loadNotes();
		}
	});

	/*
		Skrifa Actions Click Event Handlers
	*/

	$("body").on("click","[data-action]",function(){
		switch ($(this).data("action")) {

			case "help":
				$(".help").addClass("active");
				break;

			case "edit-notebook":
				if(notebook != "Inbox"){
					db.transaction('r', db.notebooks, function() {
						db.notebooks.where("id").equals(parseInt(notebook)).first(function(item, cursor){
							$(".edit-notebook input[data-input='name']").val(item.Name);
							$(".edit-notebook input[data-input='description']").val(item.Description)
							$(".edit-notebook").addClass("active");
						});
					});

				}

				break;

			case "new-notebook":
				$(".new-notebook").addClass("active");
				break;

			// Displays the notes in a list or a grid.
			case "change-view":
				$(".note-container").html("");
				$(this).toggleClass("fa-th fa-th-list");
				if($(this).hasClass("fa-th")){
					$(".note-container").removeClass("grid");
					$(".note-container").addClass("list");
					chrome.storage.sync.set({'view': "list"});
				}else{
					$(".note-container").removeClass("list");
					$(".note-container").addClass("grid");
					chrome.storage.sync.set({'view': "grid"});
				}
				loadNotes();
				break;

			// Initiates the creation of a Backup File.
			case "export":
				$(".more-actions").removeClass("active");
				createBackupJson();
				break;

			// Initiates the Restoration from a Backup File.
			case "import":
				$(".more-actions").removeClass("active");
				chooseRestore();
				break;

			// Creates a new Note in the database and in the display.
			case "new":
				var date = new Date().toString();
				db.notes.add({Title: 'New Note', Content: '<h1>New Note</h1>', CreationDate: date, ModificationDate: date, SyncDate: "", Color: colors[Math.floor(Math.random()*colors.length)], Notebook: notebook});
				loadNotes();
				break;

			// Returns to the main view.
			case "back":
				$("img").each(function(){
					window.URL.revokeObjectURL($(this).attr("src"));
				}).promise().done(function(){
					id = null;
					view = null;
					$("#editor").hide();
					$("#view").hide();
					$("#editor").html("");
					$("#view").html("");
					$(".side-nav").removeClass("active");
					$(".view-nav").removeClass("active");
					$(".notebook-nav").addClass("active");
					loadNotes();
					$("nav").show();
					$(".note-container").show();
				});

				break;

			// Shows the edit screen of a note.
			case "edit":
				if(view != null){
					id = view;
				}else{
					id = $(this).data("note-id");
				}

				db.transaction('r', db.notes, function(){
					$(".note-container").hide();
					$("#view").hide();
					db.notes.where("id").equals(id).first(function (note) {
						$("#editor").html(note.Content);
						$("#editor").show();
						$(".side-nav").addClass("active");
						$(".view-nav").removeClass("active");
						$(".notebook-nav").removeClass("active");
						$("nav").hide();
						setTimeout(function () {
							$("#editor img").each(function(){
								if($(this)[0].dataset.url != null && $(this)[0].dataset.url != ""){
									getImageUrl($(this));
								}else{
									$(this)[0].dataset.url = $(this).attr("src");
									getImageUrl($(this));

								}
							}).promise().done(function(){
								saveNote();
							});
						}, 100);
					});
				});
				break;

			// Prints the currently displaying note.
			case "print":
				window.print();
				break;

			// Initiates a note deletion transaction.
			case "delete":
				$(".delete-confirmation").addClass("active");
				deltempid = $(this).data("note-id");
				break;

			case "delete-notebook":
				$(".notebook-delete-confirmation").addClass("active");
				break;

			// Shows the more actions modal window.
			case "more":
				$(".more-actions").addClass("active");
				break;

			// Initiates an export to a Markdown File of the currently viewing note.
			case "markdown-export":
				exportNote('md', 'Markdown', exportToMarkdownFileEntry);
				//markdownExport();
				break;

            case "html-export":
				exportNote('html', 'HTML', exportToHTMLFileEntry);
				break;

			// Initiates an import from a Skrifa or Markdown file.
			case "markdown-import":
			case "note-import":
			case "import-note":
				chooseNoteToImport();
				break;

			// Initiates an export to a Skrifa File of the currently viewing note.
			case "note-export":
				exportNote('skrifa', 'Skrifa', exportToSkrifaFileEntry);
				break;

			// Changes the mode to dark or light.
			case "set-mode":
				$(this).toggleClass("fa-moon-o fa-sun-o");
				$("body").toggleClass("light dark");
				if($("body").hasClass("dark")){
					chrome.storage.sync.set({'mode': "dark"});
				}else{
					chrome.storage.sync.set({'mode': "light"});
				}
				break;
		}
	});

	$("body").on("click", ".notebook-nav [data-notebook]", function(){
		notebook = $(this).data("notebook") + "";
		$(".notebook-nav h1").text($(this).text());
		if(notebook != "Inbox"){
			db.transaction('r', db.notebooks, function() {
				db.notebooks.where("id").equals(parseInt(notebook)).first(function(item, cursor){
					$(".notebook-nav small").text(item.Description);
					$("[data-action='edit-notebook']").show();
					$("[data-action='delete-notebook']").show();
				});
			});
		}else{
			$(".notebook-nav small").text("A place for any note");
			$("[data-action='edit-notebook']").hide();
			$("[data-action='delete-notebook']").hide();
		}

		loadNotes();
	});

	/*
		Editor Auxiliary Functions
	*/

	// Returns the current selected text.
	function getSelectionText() {
	    var text = "";
	    if(window.getSelection){
	        text = window.getSelection().toString();
	    }else if(document.selection && document.selection.type != "Control"){
	        text = document.selection.createRange().text;
	    }
	    return text;
	}

	// Saves/Modifies the current note into the database.
	function saveNote(){
		var html = $("#editor").html().trim();
		var date = new Date().toString();
		db.transaction('rw', db.notes, function(){
			var h1 = $("#editor h1").first().text().trim();
			h1 = h1 != "" ? h1 : "Untitled";
			if(html && h1 && date){
				db.notes.where("id").equals(id).modify({Content: html, Title: h1, ModificationDate: date});
			}
		});
	}

	/*
		Editor Event Handlers
	*/

	// Sves the note every time it is edited.
	$("#editor").on("keyup",function(e){
		saveNote();
	});

	// Prevents external styles from being copied.
	$('#editor').on('paste',function(e) {
	    e.preventDefault();
	    var plainText = (e.originalEvent || e).clipboardData.getData('text/plain');
	    var originalText = (e.originalEvent || e).clipboardData.getData('text/html');
	    document.execCommand('insertText', false, plainText);
	});

	// Handles the indentation and outdentation when the tab and shift key are pressed.
	var map = {9: false, 16: false};
	$("#editor").on('keydown', function(e) {
	  var keyCode = e.keyCode || e.which;
		if (keyCode in map) {
        	map[keyCode] = true;
	        if (map[9] && map[16]) {
		       e.preventDefault();
	           document.execCommand('outdent', false, null);
	        }else if (map[9]) {
			    e.preventDefault();
				if(e.target.nodeName != "CODE" || e.target.nodeName != "PRE"){
					document.execCommand('indent', false, null);
				}else{
					document.execCommand('insertText', false, "    ");
				}

			}
        }
	}).keyup(function(e) {
		var keyCode = e.keyCode || e.which;
	    if (keyCode in map) {
	        map[keyCode] = false;
	    }
	});

	/*
		Editor Tools Click Events
	*/

	$("[data-tool]").click(function(){
		switch($(this).data("tool")){

			case "h1":
			case "h2":
			case "h3":
			case "h4":
			case "h5":
			case "h6":
			case "mark":
			case "blockquote":
				document.execCommand('formatBlock', false, '<' + $(this).data("tool") + '>');
				break;

			case "bold":
			case "italic":
			case "underline":
			case "strikeThrough":
			case "undo":
			case "redo":
			case "superscript":
			case "subscript":
			case "unlink":
				document.execCommand($(this).data("tool"), false, null);
				break;

			case "Left":
			case "Right":
			case "Center":
			case "Full":
				document.execCommand("justify" + $(this).data("tool"), false, null);
				break;

			case "snippet":
			case "insert-icon":
			case "insert-math":
				$("." + $(this).data("tool")).addClass("active");
				break;

			case "ol":
				document.execCommand("insertOrderedList", false, null);
				break;

			case "ul":
				document.execCommand("insertUnorderedList", false, null);
				break;

			case "link":
				$(".insert-link input[data-input='text']").val(getSelectionText().trim());
				document.execCommand('insertHTML', false, "<span class='insertLink-div'></span>");
				$(".insert-link").addClass("active");
				break;

			case "image":
				document.execCommand('insertHTML', false, "<span class='insertImage-div'></span>");
				$(".insert-image").addClass("active");
				break;

			case "video":
				document.execCommand('insertHTML', false, "<span class='insertVideo-div'></span>");
				$(".insert-video").addClass("active");
				break;

			case "table":
				document.execCommand('insertHTML', false, "<span class='insertTable-div'></span>");
				$(".insert-table").addClass("active");
				break;

			case "edit-html":
				$(".edit-html textarea").val($("#editor").html());
				$(".edit-html").addClass("active");
				break;

			case "insert-html":
				document.execCommand('insertHTML', false, "<span class='insertHTML-div'></span>");
				$(".insert-html").addClass("active");
				break;
		}
		saveNote();
	});

	/*
		Modal Window Insertions to the Note
	*/

	// Inserts a Font Awesome icon when clicked.
	$(".insert-icon .fa").click(function(){
		document.execCommand('insertText', false, "[:" + $(this).attr("class").split(" ")[1].split("fa-")[1] + ":]");
		$(".insert-icon").removeClass("active");
		saveNote();
	});

	// Inserts a Math Symbol when clicked.
	$(".insert-math .mathSymbol").click(function(){
		document.execCommand('insertText', false, $(this).attr("alt"));
		$(".insert-math").removeClass("active");
		saveNote();
	});

	/*
		Modal Window Ok button handlers.
	*/

	// Replaces the note's HTML code with the one given.
	$(".edit-html .ok").click(function(){
		var edited = $(".edit-html textarea").val();
		if(edited != $("#editor").html()){
			$("#editor").html(edited);
			$("#editor img").each(function(){
				if(!$(this)[0].dataset.url){
					$(this)[0].dataset.url = $(this).attr("src");
				}
				getImageUrl($(this));
			});
			saveNote();
		}
		$(".edit-html").removeClass("active");
	});

	// Inserts the given HTML code into the note.
	$(".insert-html .ok").click(function(){
		var value = $(".insert-html textarea").val().trim();
		if(value != ""){
			$("span.insertHTML-div").replaceWith(value);
		}
		$(".insert-html").removeClass("active");
		$(".insert-html textarea").val("");
		$("span.insertHTML-div").remove();
		saveNote();
	});

	// Deletes the selected note from the Database.
	$(".delete-confirmation .ok").click(function(){
		db.transaction('rw', db.notes, function(){
			db.notes.where("id").equals(deltempid).delete();
			deltempid = null;
			loadNotes();
			$(".delete-confirmation").removeClass("active");
		});
	});

	$(".notebook-delete-confirmation .ok").click(function(){
		switch($(".notebook-delete-confirmation select").val()){
			case "Move":
				db.transaction('rw', db.notebooks, function(){
					db.notebooks.where("id").equals(parseInt(notebook)).delete().then(function(){
						loadNotebooks();
					});
				}).then(function(){
					db.transaction('rw', db.notes, function(){
						db.notes.where("Notebook").equals(notebook).modify({Notebook: "Inbox"}).then(function(){
							notebook = "Inbox";
							$(".notebook-nav h1").text("Inbox");
							$(".notebook-nav small").text("A place for any note");
							$("[data-action='edit-notebook']").hide();
							$("[data-action='delete-notebook']").hide();
							loadNotes();
							$(".notebook-delete-confirmation").removeClass("active");
						});
					});
				});
				break;

			case "Delete":
				db.transaction('rw', db.notebooks, function(){
					db.notebooks.where("id").equals(parseInt(notebook)).delete().then(function(){
						loadNotebooks();

					});

				}).then(function(){
					db.transaction('rw', db.notes, function(){
						db.notes.where("Notebook").equals(notebook).delete().then(function(){
							notebook = "Inbox";
							$(".notebook-nav h1").text("Inbox");
							$(".notebook-nav small").text("A place for any note");
							$("[data-action='edit-notebook']").hide();
							$("[data-action='delete-notebook']").hide();
							loadNotes();
							$(".notebook-delete-confirmation").removeClass("active");
						});
					});
				});
				break;
		}
	});

	// Inserts a link in the note.
	$(".insert-link .ok").click(function(){
		var text = $(".insert-link [data-input='text']").val().trim();
		var link = $(".insert-link [data-input='link']").val().trim();
		if(text != "" && link != ""){
			$("span.insertLink-div").replaceWith("<a href='" + link + "' target='_blank'>" + text + "</a>");
		}
		$(".insert-link").removeClass("active");
		$(".insert-link input[data-input='text']").val("");
		$(".insert-link input[data-input='link']").val("");
		$("span.insertLink-div").remove();
		saveNote();
	});

	// Transform images to Base64 encoding, encoding it to Base64 will produce a
	// bigger size image which should be handled with care and it will also remove
	// any metadata from the file, improving privacy
	function toDataUrl (url, callback) {
		var xhr = new XMLHttpRequest();
		xhr.responseType = 'blob';
		xhr.onload = function() {
			var reader = new FileReader();
			reader.onloadend = function() {
				callback(reader.result);
			}
			reader.readAsDataURL(xhr.response);
		};
		xhr.onerror = function() {
			$_("span.insertImage-div").remove();
		};
		xhr.open('GET', url);
		xhr.send();
	}

	// Inserts the image form the given URL into the note.
	$(".insert-image .ok").click(function(){
		event.preventDefault();
		var value = $(".insert-image input").val().trim();
		if(value != ""){
			toDataUrl(value, function(url){
				$("span.insertImage-div").replaceWith("<img class='lazy' src='" + url+ "' alt='" + value + "' data-url='" + value + "'>");
				$("span.insertImage-div").remove();
				$("span.insertImage-div").remove();
				$(".insert-image").removeClass("active");
				$(".insert-image input").val("");
				saveNote();
			});

		}
	});

	chrome.storage.sync.get('announcement', function(value){
		if(value.announcement != 'seen'){
			$(".announcement").addClass("active");
		}
	});

	$(".announcement .ok").click(function(){
		$(".announcement").removeClass("active");
		window.open('https://skrifa.xyz', '_blank');
		chrome.storage.sync.set({'announcement': 'seen'});
	});

	$(".announcement .close").click(function(){
		$(".announcement").removeClass("active");
		chrome.storage.sync.set({'announcement': 'seen'});
	});



	// Inserts a table with the culumns x rows given.
	$(".insert-table .ok").click(function(){

		var columns = $(".insert-table input[data-input='columns']").val();
		var rows = $(".insert-table input[data-input='rows']").val();
		if(columns != "" && rows != ""  && parseInt(columns) > 0 && parseInt(rows) > 0 ){
			var table = "<br><div class='table-wrapper'> <table>";
			for(var i = 0; i < rows; i++) {
	            table += '<tr>';
	            for(var j = 0; j < columns; j++) {
		            table += '<td></td>';
	            }
            	table += '</tr>';
	        }
			table += '</table></div><br>';
			$("span.insertTable-div").replaceWith(table);
		}
		$(".insert-table").removeClass("active");
		$(".insert-table input[data-input='columns']").val("");
		$(".insert-table input[data-input='rows']").val("");
		$("span.insertTable-div").remove();
		saveNote();
	});

	// Shows confirmation to restore the notes from a backup file.
	$(".restore-backup .ok").click(function(){
		$(".restore-confirmation").addClass("active");
	});

	// Executes the backup restoration.
	$(".restore-confirmation .ok").click(function(){
		var value = $(".restore-backup textarea").val().trim();
		if(value != ""){
			restoreFromBackup(value);
		}
	});

	// Inserts the given embedded video into the note.
	$(".insert-video .ok").click(function(){
		var value = $(".insert-video textarea").val().trim();
		if(value != ""){
			value = value.replace(/<iframe/g, "<webview").replace(/<\/iframe>/g, "</webview>");
			$("span.insertVideo-div").replaceWith("<br><div class='video-wrapper'>" + value + "</div><br>");
		}
		$(".insert-video").removeClass("active");
		$(".insert-video textarea").val("");
		$("span.insertVideo-div").remove();
		saveNote();
	});

	// Inserts the code element with the given language.
	$(".snippet .ok").click(function(){
		var code = "<pre><code class='language-" + $(".snippet select").val() + "'>Your Code...</code></pre><br>";
		document.execCommand('insertHTML', false, code);
		$(".snippet").removeClass("active");
		saveNote();
	});

	// Inserts the code element with the given language.
	$(".new-notebook .ok").click(function(){
		if($(".new-notebook input[data-input='name']").val().trim() != ""){
			db.notebooks.add({Name: $(".new-notebook input[data-input='name']").val(), Description: $(".new-notebook input[data-input='description']").val()});
			loadNotebooks();
		}
		$(".new-notebook").removeClass("active");
		$(".new-notebook input[data-input='name']").val("");
		$(".new-notebook input[data-input='description']").val("");
	});

	$(".edit-notebook .ok").click(function(){
		db.transaction('rw', db.notebooks, function() {
			db.notebooks.where("id").equals(parseInt(notebook)).modify({Name: $(".edit-notebook input[data-input='name']").val(),
				Description: $(".edit-notebook input[data-input='description']").val()});
			$(".notebook-nav h1").text($(".edit-notebook input[data-input='name']").val());
			$(".notebook-nav small").text( $(".edit-notebook input[data-input='description']").val());
		});
		loadNotebooks();
		$(".edit-notebook").removeClass("active");
	});

	/*
		Modal Window Close Event
	*/

	$(".modal .close").click(function(){
		// Get the modal element to which the clicked close button belongs
		var modal = $(this).closest(".modal");

		// Hide the modal element
		modal.removeClass("active");

		// Remove the temporal insertion element
		if(modal.data("insert-element")){
			var data = modal.data("insert-element");

			// Set back the text to the editor in case the link modal is closed
			if(data == "Link"){
				$("span.insertLink-div").replaceWith($(".insert-link [data-input='text']").val().trim());
			}
			$("span.insert" + modal.data("insert-element") + "-div").remove();
			saveNote();
		}

		// Set the temporal deletion id to null in case it's the delete confirmation modal
		if(modal.hasClass("delete-confirmation")){
			deltempid = null;
		}

		// Empty the inputs and textarea of the modal
		modal.children("input, textarea").each(function(){
			$(this).val("");
		});

	});

});
