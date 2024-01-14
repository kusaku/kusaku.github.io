// Modern menu system - converts XML to ul/li structure
// Works in modern browsers (no IE-specific code)

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

    // Check if menu item is locked (password protected)
    function isLocked(content, password) {
        if (!password) return false;
        var proto = "proto" + getPasswordHash(content);
        return getCookie(proto) !== password;
    }

    function getPasswordHash(str) {
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            hash += str.charCodeAt(i) * i;
        }
        return hash;
    }

    // Create menu object structure for compatibility (used by sitemap)
    var menuHashCounter = 0;
    function createMenuObject(xmlNode, parentObj, index) {
        var content = "";
        var password = null;
        var submenuItems = [];
        var currentIndex = menuHashCounter++;
        var shortcut = "menuHash[" + currentIndex + "]";

        // Extract content, password, and submenu items
        for (var i = 0; i < xmlNode.childNodes.length; i++) {
            var node = xmlNode.childNodes[i];
            if (node.nodeType === 1) { // Element node
                if (node.nodeName === "content") {
                    content = node.textContent || node.innerText || "";
                } else if (node.nodeName === "password") {
                    password = node.getAttribute("value");
                } else if (node.nodeName === "menuItem") {
                    submenuItems.push(node);
                }
            }
        }

        var locked = isLocked(content, password);
        var menuObj = {
            content: content,
            shortcut: shortcut,
            locked: locked,
            submenus: []
        };

        // Store in menuHash for compatibility
        if (!window.menuHash) {
            window.menuHash = [];
        }
        window.menuHash[currentIndex] = menuObj;

        // Recursively create submenu objects
        for (var j = 0; j < submenuItems.length; j++) {
            var subObj = createMenuObject(submenuItems[j], menuObj, j);
            menuObj.submenus.push(subObj);
        }

        return menuObj;
    }

    // Parse XML menu item and convert to li element
    function parseMenuItem(xmlNode, parentLi) {
        var content = "";
        var password = null;
        var submenuItems = [];

        // Extract content, password, and submenu items
        for (var i = 0; i < xmlNode.childNodes.length; i++) {
            var node = xmlNode.childNodes[i];
            if (node.nodeType === 1) { // Element node
                if (node.nodeName === "content") {
                    content = node.textContent || node.innerText || "";
                } else if (node.nodeName === "password") {
                    password = node.getAttribute("value");
                } else if (node.nodeName === "menuItem") {
                    submenuItems.push(node);
                }
            }
        }

        // Create li element
        var li = document.createElement("li");
        var locked = isLocked(content, password);

        // Create anchor or span for content
        if (content.trim()) {
            // Content is HTML-encoded (e.g., &lt;A&gt;), decode it
            var tempDiv = document.createElement("div");
            tempDiv.innerHTML = content;
            var linkElement = tempDiv.firstChild;

            if (linkElement && linkElement.tagName === "A") {
                // It's a link
                if (locked) {
                    var proto = "proto" + getPasswordHash(content);
                    linkElement.href = "unlock.html?" + proto;
                    linkElement.title = "Это меню заблокировано - требуется пароль";
                    // Clear existing content and add locked text
                    while (linkElement.firstChild) {
                        linkElement.removeChild(linkElement.firstChild);
                    }
                    linkElement.appendChild(document.createTextNode("(закрыто)"));
                }
                li.appendChild(linkElement);
            } else if (tempDiv.textContent || tempDiv.innerText) {
                // It's plain text (no HTML tags)
                var span = document.createElement("span");
                span.textContent = tempDiv.textContent || tempDiv.innerText;
                li.appendChild(span);
            } else {
                // Fallback: use content as-is
                var span = document.createElement("span");
                span.innerHTML = content;
                li.appendChild(span);
            }
        }

        // Add submenu if exists
        if (submenuItems.length > 0 && !locked) {
            li.classList.add("has-children");
            var ul = document.createElement("ul");
            
            for (var j = 0; j < submenuItems.length; j++) {
                parseMenuItem(submenuItems[j], ul);
            }
            
            li.appendChild(ul);
        }

        if (parentLi) {
            parentLi.appendChild(li);
        }

        return li;
    }

    // Main function to create menu
    function makeMenu(xmlFile, containerId) {
        var container = document.getElementById(containerId || "menushnik");
        if (!container) {
            console.error("Menu container not found");
            return;
        }

        // Create root ul element
        var rootUl = document.createElement("ul");
        rootUl.id = "menu-root";
        container.appendChild(rootUl);

        // Load and parse XML
        var xhr = new XMLHttpRequest();
        xhr.open("GET", xmlFile, true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var parser = new DOMParser();
                        var xmlDoc = parser.parseFromString(xhr.responseText, "text/xml");

                        // Check for parsing errors
                        if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
                            throw new Error("XML parsing error");
                        }

                        // Find root menuItem
                        var rootMenuItem = xmlDoc.getElementsByTagName("menuItem")[0];
                        if (rootMenuItem) {
                            // Create menu object structure for compatibility (used by sitemap)
                            // Reset counter for menuHash
                            menuHashCounter = 0;
                            window.menuHash = [];
                            
                            // Create the root menu object (which contains all submenus)
                            menuObject = createMenuObject(rootMenuItem, null, 0);
                            window.menu = menuObject;
                            
                            // Merge Hooker methods
                            menuObject.Hooker = menuHooker.Hooker;
                            menuObject.hooker = menuHooker.hooker;
                            
                            // Create wrapper li for root menu
                            var rootLi = document.createElement("li");
                            rootLi.classList.add("has-children");
                            
                            // Get root content if exists
                            var rootContent = "";
                            var rootContentNodes = rootMenuItem.getElementsByTagName("content");
                            if (rootContentNodes.length > 0) {
                                rootContent = rootContentNodes[0].textContent || rootContentNodes[0].innerText || "";
                            }
                            
                            if (rootContent.trim()) {
                                var tempDiv = document.createElement("div");
                                tempDiv.innerHTML = rootContent;
                                var rootLink = tempDiv.firstChild;
                                if (rootLink && rootLink.tagName === "A") {
                                    rootLi.appendChild(rootLink);
                                } else {
                                    var rootSpan = document.createElement("span");
                                    rootSpan.textContent = rootContent;
                                    rootLi.appendChild(rootSpan);
                                }
                            }
                            
                            // Create submenu ul
                            var submenuUl = document.createElement("ul");
                            
                            // Parse all top-level menu items
                            for (var i = 0; i < rootMenuItem.childNodes.length; i++) {
                                var node = rootMenuItem.childNodes[i];
                                if (node.nodeType === 1 && node.nodeName === "menuItem") {
                                    parseMenuItem(node, submenuUl);
                                }
                            }
                            
                            if (submenuUl.children.length > 0) {
                                rootLi.appendChild(submenuUl);
                            }
                            rootUl.appendChild(rootLi);
                            
                            // Update menu root element
                            menuRootElement = rootLi;
                        }
                    } catch (e) {
                        console.error("Error parsing menu XML:", e);
                        var errorLi = document.createElement("li");
                        errorLi.textContent = "Ошибка загрузки меню";
                        rootUl.appendChild(errorLi);
                    }
                } else {
                    console.error("Failed to load menu XML:", xhr.status);
                    var errorLi = document.createElement("li");
                    errorLi.textContent = "Ошибка загрузки меню";
                    rootUl.appendChild(errorLi);
                }
            }
        };
        xhr.send();
    }

    // Store menu root element for Hooker method
    var menuRootElement = null;
    
    // Store menu object structure for compatibility (used by sitemap)
    var menuObject = null;

    // Hooker method for compatibility with old menu system
    function createHookerMethod() {
        return {
            Hooker: function(action) {
                // Always try to find menu root element
                updateMenuRoot();
                
                if (menuRootElement) {
                    if (action === "MOUSEOVER" || action === 1) {
                        // Show menu on click
                        menuRootElement.classList.add("menu-show");
                    } else if (action === "MOUSEOUT" || action === 0) {
                        // Remove class to hide menu
                        menuRootElement.classList.remove("menu-show");
                    }
                } else {
                    console.warn("Menu root element not found");
                }
            },
            hooker: function(action) {
                // Lowercase version for compatibility
                return this.Hooker(action);
            }
        };
    }

    // Create menu object with Hooker method (will be merged with menuObject if it exists)
    var menuHooker = createHookerMethod();
    
    // Merge Hooker methods into menu object if it exists
    if (menuObject) {
        menuObject.Hooker = menuHooker.Hooker;
        menuObject.hooker = menuHooker.hooker;
        window.menu = menuObject;
    } else {
        window.menu = menuHooker;
    }
    
    // Hide menu when clicking outside
    document.addEventListener('click', function(e) {
        if (menuRootElement && !menuRootElement.contains(e.target)) {
            menuRootElement.classList.remove("menu-show");
        }
    });
    

    // Export function
    window.MakeMenu = makeMenu;

    // Function to update menu root element
    function updateMenuRoot() {
        var menuContainer = document.getElementById("menushnik");
        if (menuContainer) {
            menuRootElement = menuContainer.querySelector("li.has-children");
        }
    }

    // Auto-initialize if menu_file variable is set
    if (typeof menu_file !== 'undefined') {
        var initMenu = function() {
            makeMenu(menu_file, "menushnik");
            // Update menu root element after menu is created
            // Try multiple times since XML loading is async
            var attempts = 0;
            var checkInterval = setInterval(function() {
                updateMenuRoot();
                if (menuRootElement || attempts++ > 20) {
                    clearInterval(checkInterval);
                }
            }, 100);
        };
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initMenu);
        } else {
            initMenu();
        }
    }
    
    // Also try to update menu root on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateMenuRoot);
    } else {
        updateMenuRoot();
    }
    
    // Modern event delegation for menu links
    function initMenuLinks() {
        // Find all links that should open the menu
        document.addEventListener('click', function(e) {
            var target = e.target;
            // Check if clicked element or its parent is a menu link
            while (target && target.tagName !== 'A') {
                target = target.parentElement;
            }
            
            if (target && target.tagName === 'A') {
                var href = target.getAttribute('href');
                // Check if it's a menu hooker link
                if (href && (href.indexOf('menu.Hooker') !== -1 || href.indexOf('menu.hooker') !== -1 || 
                             target.getAttribute('data-menu-toggle') === 'true')) {
                    e.preventDefault();
                    if (window.menu && window.menu.Hooker) {
                        window.menu.Hooker('MOUSEOVER');
                    }
                    return false;
                }
            }
        });
    }
    
    // Initialize menu links
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMenuLinks);
    } else {
        initMenuLinks();
    }
})();
