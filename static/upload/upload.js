'use strict';
//https://css-tricks.com/drag-and-drop-file-uploading/
;
(function($, window, document, undefined) {
    // feature detection for drag&drop upload

    var isAdvancedUpload = function() {
        var div = document.createElement('div');
        return (('draggable' in div) || ('ondragstart' in div && 'ondrop' in div)) && 'FormData' in window && 'FileReader' in window;
    }();

    // If batch-all is false, we use this variable to determine the number of
    // bytes to upload at once.
    var BATCH_SIZE = 30 * 1000 * 1000;
    
    
    var splitPath = function(path) {
      // https://gist.github.com/nopjia/e94b5f822744b60cd106
      var result = path.replace(/\\/g, "/").match(   /(.*\/)?(\..*?|.*?)(\.[^.]*?)?(#.*$|\?.*$|$)/   );
      return {
        dirname: result[1] || "",
        filename: result[2] || "",
        extension: result[3] || "",
        params: result[4] || ""
      };
    };
    
    var getEnclosingFolder = function(path) {
        if (path.includes('/')) {
          var parts = path.replace(/\\/g, "/").split('/');
          return parts[parts.length-2];
        }
        return '';
    }


    function uploadFiles($form, files, beforeSendCb, completeCb, successCb, errorCb, progressCb) {
        console.log('Uploading batch of', files.length, 'file(s)');

        var ajaxData = new FormData();

        // See if we have instructions on how to handle file name collision
        var collision = $form.attr('collision');
        if (typeof collision !== 'undefined' && collision !== false) {
            console.log('Setting collsion to', collision);
            ajaxData.append('collision', collision);
        }
        
        var desig = $form.attr('data_designation');
        if (typeof desig !== 'undefined' && desig !== false) {
            console.log('Setting desig to', desig);
            ajaxData.append('data_designation', desig);
        }
        
        let includeEnclosingFolder = false;
        let labelWithFolder = $form.attr('label-with-folder');
        if (typeof labelWithFolder !== 'undefined' && labelWithFolder !== false) {        
            if (labelWithFolder === 'true') {
              includeEnclosingFolder = true;
            }
        }
        
        for (var i in files) {
            ajaxData.append('file', files[i]);
            if (includeEnclosingFolder) {
                let enclosingDir;
                if ('customFullPath' in files[i]) {
                    enclosingDir = getEnclosingFolder(files[i].customFullPath)
                }
                else {
                    enclosingDir = getEnclosingFolder(files[i].webkitRelativePath)
                }
                ajaxData.append('enclosing_folder', enclosingDir);
            }
        }

        if ($form.data('custom_fields') != null) {
            let customFields = $form.data('custom_fields');
            for (let fieldName in customFields) {
                for (let item in customFields[fieldName]) {
                    ajaxData.append(fieldName, customFields[fieldName][item]);
                }
            }
        }

        $.ajax({
            url: $form.attr('action'),
            type: $form.attr('method'),
            data: ajaxData,
            dataType: 'json',
            cache: false,
            contentType: false,
            processData: false,
            xhr: function() {
                //http://www.dave-bond.com/blog/2010/01/JQuery-ajax-progress-HMTL5/
                var xhr = new window.XMLHttpRequest();
                //Upload progress
                xhr.upload.addEventListener("progress", progressCb, false);
                return xhr;
            },
            beforeSend: beforeSendCb,
            complete: completeCb,
            success: successCb,
            error: errorCb
        });
    }


    // applying the effect for every form

    $('.upload').each(function() {
        var $form = $(this),
            $input = $form.find('input[type="file"]'),
            $label = $form.find('label'),
            $errorMsg = $form.find('.upload__error span'),
            $restart = $form.find('.upload__restart'),
            droppedFiles = [];

        var uploadQueue = null;
        var uploadQueueData = {
            length: null,
            batchAll: null
        };

        var cancelUpload = function() {
            $form.removeClass('is-uploading');
            $input.val('');
            droppedFiles = []
            $('#progressBarContainer').hide();
        }

        var terminateUpload = function(files, data) {
            cancelUpload();

            var cb = $form.attr('callback');
            var fn = window[cb];
            if (typeof fn === 'function') {
                fn(files, data);
            }
        }

        // letting the server side to know we are going to make an Ajax request
        $form.append('<input type="hidden" name="ajax" value="1" />');

        // automatically submit the form on file select
        $input.on('change', function(e) {
            $form.trigger('submit');

        });

        var scanFilesFound = 0;
        var scanFilesProcessed = 0;
        var scanFoldersFound = 0;
        var scanFoldersProcessed = 0;

        var scanFiles = function(item, callback) {

            if (item.isDirectory) {
                scanFoldersFound += 1;
                let directoryReader = item.createReader();
                directoryReader.readEntries(function(entries) {
                    scanFoldersProcessed += 1;
                    entries.forEach(function(entry) {
                        scanFiles(entry, callback);
                    });
                });
            }

            if (item.isFile) {
                scanFilesFound += 1;
                item.file(function(file) {
                    scanFilesProcessed += 1;
                    file.customFullPath = item.fullPath;
                    callback(file);
                });
            }
        };

        // drag&drop files if the feature is available
        if (isAdvancedUpload) {
            let dropAreaId = $form.attr('drop-area');
            if (typeof dropAreaId !== 'undefined' && dropAreaId !== false) {
                let $dropArea = document.getElementById(dropAreaId); 

                $dropArea.addEventListener("dragover", function(event) {
                    event.preventDefault();
                }, false);

                $dropArea.addEventListener("drop", function(event) {
                    let items = event.dataTransfer.items;
                    event.preventDefault();
                    droppedFiles = [];

                    scanFilesFound = 0;
                    scanFilesProcessed = 0;
                    scanFoldersFound = 0;
                    scanFoldersProcessed = 0;

                    for (let i = 0; i < items.length; i++) {
                        let item = items[i].webkitGetAsEntry();

                        if (item) {
                            scanFiles(item, function(file) {
                                droppedFiles.push(file);
                                if (scanFilesProcessed == scanFilesFound && scanFoldersProcessed == scanFoldersFound) {
                                    $form.trigger('submit');
                                }
                            });
                        }
                    }
                }, false);
            }

        }


        $form.on("processUploadQueue", function(event) {
            if (uploadQueue == null || uploadQueueData == null) {
                return;
            }

            var progress = (uploadQueueData.length - uploadQueue.length) / uploadQueueData.length;
            $('#progressBar').width((progress * 100.) + '%');

            var files;
            if (uploadQueueData.batchAll) {
                files = uploadQueue;
                uploadQueue = [];
            } else {
                let currBatchSize = 0;
                files = []
                while (uploadQueue.length > 0 && currBatchSize < BATCH_SIZE && files.length < 30) {
                    let currFile = uploadQueue.shift();
                    currBatchSize += currFile.size;
                    files.push(currFile);
                }
            }

            uploadFiles(
                $form,
                files,

                function(XMLHttpRequest) { // beforeSend

                },

                function(data) // complete
                {

                },

                function(data) // success
                {
                    if (uploadQueue.length == 0) {
                        terminateUpload(files, data);
                    } else {
                        $form.trigger('processUploadQueue');
                    }
                },

                function(error) // error
                {
                    if (error.responseJSON) {
                        if (error.responseJSON.msg) {
                            alert(error.responseJSON.msg);
                        } else {
                            alert('An unknown error has occurred. Please try again.');
                        }
                    } else {
                        alert('Upload error. Please verify your internet connection and try again.');
                    }
                    terminateUpload();
                },

                function(evt) { // progress
                    if (evt.lengthComputable) {
                        var percentComplete = evt.loaded / evt.total;
                        var currChunk = files.length / uploadQueueData.length;
                        var normalized = percentComplete * currChunk;
                        var overall = progress + normalized;
                        $('#progressBar').width((overall * 100.) + '%');
                    }
                }
            );
        });

        // if the form was submitted

        var initializeUpload = function() {
            $form.addClass('is-uploading').removeClass('is-error');

            if (isAdvancedUpload) // ajax file upload for modern browsers
            {
                // gathering the form data

                var inputFiles = new FormData($form.get(0));

                if (droppedFiles && droppedFiles.length) {
                    $.each(droppedFiles, function(i, file) {
                        inputFiles.append($input.attr('name'), file);
                    });
                }

                uploadQueue = [];
                var files = inputFiles.getAll('file');

                var filterCb = $form.attr('filter');
                var fileLimitAttr = $form.attr('file-limit');
                var fileLimit = -1;
                if (typeof fileLimitAttr !== 'undefined' && fileLimitAttr !== false) {
                    fileLimit = parseInt(fileLimitAttr);
                }
                for (var f in files) {

                    if (files[f].name.length == 0) {
                        continue;
                    }

                    if (fileLimit > 0 && uploadQueue.length >= fileLimit) {
                        console.log('Truncating upload queue at limit', fileLimit);
                        break;
                    }
                    if (typeof filterCb !== 'undefined' && filterCb !== false) {
                        var filterFn = window[filterCb];
                        let filteredFile = filterFn(files[f]);
                        if (filteredFile) {
                            // if filterFn returns null, then we don't upload
                            uploadQueue.push(filteredFile);
                        }
                    } else {
                        uploadQueue.push(files[f]);
                    }
                }

                if (uploadQueue.length == 0) {
                    terminateUpload(null, null);
                    return;
                }

                var batchAll = $form.attr('batch-all') === 'true' ? true : false;
                uploadQueueData = {
                    length: uploadQueue.length,
                    batchAll: batchAll
                }

                $('#progressBar').width('0%');
                var barContainer = $('#progressBarContainer');
                barContainer.show();


                $form.trigger('processUploadQueue');

            } else {
                // fallback Ajax solution upload for older browsers
                alert('Your browser is not supported. Please use a newer browser');
                /*var iframeName	= 'uploadiframe' + new Date().getTime(),
                	$iframe		= $( '<iframe name="' + iframeName + '" style="display: none;"></iframe>' );

                $( 'body' ).append( $iframe );
                $form.attr( 'target', iframeName );

                $iframe.one( 'load', function()
                {
                	var data = $.parseJSON( $iframe.contents().find( 'body' ).text() );
                	$form.removeClass( 'is-uploading' ).addClass( data.success == true ? 'is-success' : 'is-error' ).removeAttr( 'target' );
                	if( !data.success ) $errorMsg.text( data.error );
                	$iframe.remove();
                });*/
            }
        };

        $form.on('submit', function(e) {

            e.preventDefault();
            // preventing the duplicate submissions if the current one is in progress
            if ($form.hasClass('is-uploading')) return false;

            $form.data('custom_fields', null);
            var beforeUploadCb = $form.attr('before-upload');
            if (typeof beforeUploadCb !== 'undefined' && beforeUploadCb !== false) {
                var beforeUploadFn = window[beforeUploadCb];
                beforeUploadFn($form, function() {
                    initializeUpload();
                }, function() {
                    cancelUpload();
                });
            } else {
                initializeUpload();
            }
        });

        // restart the form if has a state of error/success

        $restart.on('click', function(e) {
            e.preventDefault();
            $form.removeClass('is-error is-success');
            $input.trigger('click');
        });

        // Firefox focus bug fix for file input
        $input
            .on('focus', function() {
                $input.addClass('has-focus');
            })
            .on('blur', function() {
                $input.removeClass('has-focus');
            });
    });

})(jQuery, window, document);
