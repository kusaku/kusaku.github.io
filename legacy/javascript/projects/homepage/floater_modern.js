// Modern draggable floater system - works in all browsers
// Replaces the old addFloater function from menushnik.js

(function() {
    'use strict';

    // Cookie utilities
    function setCookie(name, value, days) {
        var expires = "";
        if (days) {
            var date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/";
    }

    function getCookie(name) {
        var nameEQ = name + "=";
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) {
                return decodeURIComponent(c.substring(nameEQ.length, c.length));
            }
        }
        return null;
    }

    function addFloater(fly, index) {
        if (fly.getAttribute("name") !== "floater") return;
        if (!fly.getAttribute("id")) fly.id = "floater" + index;
        
        fly.moveEnabled = false;
        fly.rolled = false;
        fly.dragElement = null;
        fly.dragOffsetX = 0;
        fly.dragOffsetY = 0;

        // Find elements by name attribute
        function findElementsByName(obj, name) {
            var results = [];
            if (obj.getAttribute && obj.getAttribute("name") === name) {
                results.push(obj);
            }
            if (obj.children) {
                for (var i = 0; i < obj.children.length; i++) {
                    results = results.concat(findElementsByName(obj.children[i], name));
                }
            }
            return results;
        }

        var moverElements = findElementsByName(fly, "mover");
        var rollerElements = findElementsByName(fly, "roller");
        var closerElements = findElementsByName(fly, "closer");
        var contentElements = findElementsByName(fly, "content");

        if (contentElements.length > 0) {
            fly.content = contentElements[0];
        }

        // Roll function (collapse/expand)
        fly.roll = function() {
            this.rolled = !this.rolled;
            if (this.content) {
                if (this.rolled) {
                    this.content.style.display = "none";
                } else {
                    // Restore table cell display for proper colspan behavior
                    this.content.style.display = "";
                }
            }
        };

        // Close function
        fly.close = function() {
            this.style.display = "none";
        };

        // Get zoom factor from CSS
        function getZoomFactor() {
            var html = document.documentElement;
            var computedZoom = window.getComputedStyle(html).zoom;
            if (computedZoom && computedZoom !== 'normal') {
                return parseFloat(computedZoom);
            }
            return 1;
        }

        // Start drag
        fly.startdrag = function(e) {
            e = e || window.event;
            this.moveEnabled = true;
            
            // Get mouse position (viewport coordinates)
            var mouseX = e.clientX || (e.touches && e.touches[0].clientX);
            var mouseY = e.clientY || (e.touches && e.touches[0].clientY);
            
            // Get element position (viewport coordinates, already scaled by zoom)
            var rect = this.getBoundingClientRect();
            var zoom = getZoomFactor();
            
            // Calculate offset in document coordinates (divide by zoom to convert from viewport to document)
            this.dragOffsetX = (mouseX - rect.left) / zoom;
            this.dragOffsetY = (mouseY - rect.top) / zoom;
            
            if (e.preventDefault) e.preventDefault();
            return false;
        };

        // Stop drag
        fly.stopdrag = function() {
            this.moveEnabled = false;
        };

        // Move during drag
        fly.move = function(e) {
            if (!this.moveEnabled) return;
            
            e = e || window.event;
            var mouseX = e.clientX || (e.touches && e.touches[0].clientX);
            var mouseY = e.clientY || (e.touches && e.touches[0].clientY);
            
            if (mouseX < 10 || mouseY < 10) return;
            
            var scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            var zoom = getZoomFactor();
            
            // Convert viewport coordinates to document coordinates and apply offset
            this.style.left = ((mouseX / zoom) - this.dragOffsetX + scrollLeft) + "px";
            this.style.top = ((mouseY / zoom) - this.dragOffsetY + scrollTop) + "px";
        };

        // Attach event listeners
        for (var i = 0; i < moverElements.length; i++) {
            moverElements[i].style.cursor = 'move';
            moverElements[i].addEventListener('mousedown', function(e) {
                fly.startdrag(e);
            });
            moverElements[i].addEventListener('touchstart', function(e) {
                fly.startdrag(e);
            });
        }

        for (var i = 0; i < rollerElements.length; i++) {
            rollerElements[i].style.cursor = 'pointer';
            rollerElements[i].addEventListener('click', function() {
                fly.roll();
            });
        }

        for (var i = 0; i < closerElements.length; i++) {
            closerElements[i].style.cursor = 'pointer';
            closerElements[i].addEventListener('click', function() {
                fly.close();
            });
        }

        // Global mouse/touch events (only attach once per floater)
        if (!fly._eventsAttached) {
            fly._eventsAttached = true;
            
            var mouseUpHandler = function() {
                fly.stopdrag();
            };
            var touchEndHandler = function() {
                fly.stopdrag();
            };
            var mouseMoveHandler = function(e) {
                fly.move(e);
            };
            var touchMoveHandler = function(e) {
                fly.move(e);
            };
            
            document.addEventListener('mouseup', mouseUpHandler);
            document.addEventListener('touchend', touchEndHandler);
            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('touchmove', touchMoveHandler);
            
            // Store handlers for potential cleanup
            fly._handlers = {
                mouseup: mouseUpHandler,
                touchend: touchEndHandler,
                mousemove: mouseMoveHandler,
                touchmove: touchMoveHandler
            };
        }

        // Restore from cookie
        var cookieData = getCookie(fly.id);
        if (cookieData) {
            var opts = cookieData.split("+");
            if (opts.length >= 3) {
                if (opts[0] === "true") fly.roll();
                fly.style.left = opts[1];
                fly.style.top = opts[2];
            }
        }

        // Save on unload
        window.addEventListener('beforeunload', function() {
            setCookie(fly.id, fly.rolled + "+" + fly.style.left + "+" + fly.style.top, 30);
        });
    }

    // Initialize all floaters when DOM is ready
    function initFloaters() {
        var floaters = document.querySelectorAll('[name="floater"]');
        for (var i = 0; i < floaters.length; i++) {
            addFloater(floaters[i], i);
        }
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFloaters);
    } else {
        initFloaters();
    }

    // Export for compatibility
    window.addFloater = addFloater;
})();
