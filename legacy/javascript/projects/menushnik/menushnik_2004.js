//since october 2003
//updated june 2004

var SHOWING = 0
var HIDING = 1;
var VISIBLE = 2;
var HIDDEN = 3;
var MOUSEOUT = 0;
var MOUSEOVER = 1;
var MOUSEDOWN = 2
var MOUSEUP = 3;
var DBLCLICK = 4;

var hide_timer = null;
var hide_timeout = 1000
var move_step = 5;
var time_step = 10;

var menuHash = new Array();
var menu = null;

function rectify(obj)
{
	obj.x = 0;
	obj.y = 0;
	obj.w = 0;
	obj.h = 0;
	obj.setProps = function()
	{
		this.style.posLeft = this.x;
		this.style.posTop = this.y;
		this.style.width = this.w;
		this.style.height = this.h;
	}
	obj.getProps = function()
	{
		this.x = this.offsetLeft;
		this.y = this.offsetTop;
		this.w = this.offsetWidth;
		this.h = this.offsetHeight;
		var dig = obj;
		while (dig = dig.offsetParent)
		{
			this.x += dig.offsetLeft;
			this.y += dig.offsetTop;
		}
	}
}

function aksmenu(content, submenus, password)
{
	this.state = HIDDEN;
	this.content = content;
	this.parent = null;
	this.submenus = (submenus) ? submenus : new Array(); 
	{
		for (var i=0; i<this.submenus.length; i++)
			this.submenus[i].parent = this;
	}
	this.passive_class = "menu_p";
	this.active_class = "menu_a";
	this.hover_class = "menu_h";

	this.shortcut = "menuHash[" + menuHash.length + "]";
	{
		menuHash[menuHash.length] = this;
	}
	if (password)
	{
		var str = this.content;
		var val = 0;
		for (var i=0; i<str.length; i++)
			val += str.charCodeAt(i) * i;
		this.proto = "proto" + val;
		this.password = password;
	}
	this.locked = (password) ? (password != getCookie(this.proto)) : false;

	this.option = document.createElement("TABLE");
	{
		this.option.setAttribute("className", this.passive_class);
		this.option.setAttribute("name", "option");
		this.option.style.position = "absolute";

		this.option.callback = this;
		this.option.onmouseover = function(){this.callback.hooker(MOUSEOVER);}
		this.option.onmouseout = function(){this.callback.hooker(MOUSEOUT);}
		this.option.onmouseup = function(){this.callback.hooker(MOUSEUP);}
		this.option.onmousedown = function(){this.callback.hooker(MOUSEDOWN);}
		this.option.ondblclick = function(){this.callback.hooker(DBLCLICK);}

		var td_text = document.createElement("TD");
		td_text.innerHTML = (this.locked) ? "<A title='это меню заблокировано' href=unlock.dhtml?" + this.shortcut + ">(закрыто)</A>" : this.content;
		var td_more = document.createElement("TD");
		td_more.innerHTML =  (this.locked) ? "<A title='это меню заблокировано' href=unlock.dhtml?" + this.shortcut + "><IMG src=images/l.gif></A>" : "&gt;";
		td_more.setAttribute("align", "right");
		var tr = document.createElement("TR");
		tr.appendChild(td_text);
		if (this.submenus.length > 0)
			tr.appendChild(td_more);
		var tbody = document.createElement("TBODY");
		tbody.appendChild(tr);
		this.option.appendChild(tbody);

		rectify(this.option);
	}
	if (this.submenus.length > 0)
	{
		this.slider = document.createElement("DIV");
		{
			this.slider.setAttribute("name", "slider");
			this.slider.style.position = "absolute";
			for (var i=0; i<this.submenus.length; i++)
				this.slider.appendChild(this.submenus[i].option);
			rectify(this.slider);
		}
		this.container = document.createElement("DIV");
		{
			this.container.setAttribute("name", "container");
			this.container.style.position = "absolute";
			this.container.style.overflow = "hidden";
			this.container.appendChild(this.slider);
			rectify(this.container);
		}
	}
	this.place = function(object)
	{
		if (object && object.appendChild)
		{
			this.option.style.position = "static";
			object.appendChild(this.option);
		}
		if (this.submenus.length > 0)
			document.body.appendChild(this.container);

		this.option.getProps();

		for (var i=0; i<this.submenus.length; i++)
			this.submenus[i].place();
	}
	this.allocate = function()
	{		    
		if (this.submenus.length > 0)
		{
			var max_w = 0;
			var max_h = 0;
			var border = 1;

			for (var i=0; i<this.submenus.length; i++)
			{
				this.submenus[i].option.x = 0;
				this.submenus[i].option.y = max_h;
				max_w = Math.max(max_w, this.submenus[i].option.w);
				max_h += this.submenus[i].option.h - border;
			}

			this.container.x = ((this.parent) ? this.parent.container.x + this.option.w : this.option.x + this.option.w) - border;
			this.container.y = (this.parent) ? this.parent.container.y + this.option.y : this.option.y;
			this.container.w = max_w;
			this.container.h = max_h + border;
			this.container.style.visibility = (this.state == VISIBLE) ? "visible" : "hidden";
			this.container.setProps();

			this.slider.x = (this.state == VISIBLE) ? 0 : -this.container.w - move_step;
			this.slider.y = 0;
			this.slider.w = max_w;
			this.slider.h = max_h + border;
			this.slider.setProps();

			for (var i=0; i<this.submenus.length; i++)
			{
				this.submenus[i].option.w = max_w;
				this.submenus[i].allocate();
			}
		}
		this.option.setProps();
	}
	this.timerID = null;
	this.hooker = function(action)
	{
		switch (action)
		{
			case MOUSEOVER:
				clearTimeout(hide_timer);
				if (this.parent) 
					this.parent.hooker(MOUSEOVER);
				for (var i=0; i<this.submenus.length; i++)
				{
					this.submenus[i].option.className = this.passive_class;
					this.submenus[i].hide()
				}
				this.option.className = this.hover_class;
				this.show();
			break;
			case MOUSEOUT:
				this.option.className = this.passive_class;
				this.hide();
				if (this.parent) hide_timer = setTimeout("menu.hooker(MOUSEOUT);", hide_timeout);
			break;
			case MOUSEDOWN:
				this.option.className = this.active_class;
			break;
			case MOUSEUP:
				this.option.className = this.hover_class
				if (this.state==SHOWING || this.state==VISIBLE) this.hide();
				else if (this.state==HIDING || this.state==HIDDEN) this.show();
			break;
			case DBLCLICK:
				var s = "this.shortcut = " + this.shortcut + "\n";
				s += "this.locked = " + this.locked + "\n";
				s += "this.content = " + this.content + "\n";
				s += "this.state = " + this.state + "\n";
				s += "this.submenus.length = " + this.submenus.length + "\n";
				alert(s);
			break;
		}
	}
	this.show = function()
	{
		if (this.submenus.length == 0 || this.locked) return;
		if (this.state == SHOWING || this.state == VISIBLE) return;
		if (this.state == HIDING)
			clearTimeout(this.timerID);
		this.container.style.visibility = "visible";
		this.state = SHOWING;
		this.move();
	}
	this.hide = function()
	{
		if (this.submenus.length == 0) return;
		if (this.state == HIDING || this.state == HIDDEN) return;
		if (this.state == SHOWING)
			clearTimeout(this.timerID);
		//this.container.style.visibility = "hidden";
		for (var i=0; i<this.submenus.length; i++)
			this.submenus[i].hide();	
		this.state = HIDING;
		this.move();
	}
	this.move = function()
	{
		switch (this.state)
		{
			case SHOWING:
				if (this.slider.x < -move_step)
					this.slider.x += move_step;
				else
				{
					this.slider.x = 0;
					this.state = VISIBLE;
				}
				this.timerID = setTimeout(this.shortcut + ".move();", time_step);
			break;
			case HIDING:
				if (this.slider.x > -this.container.w)
					this.slider.x -= move_step;
				else
				{
					this.slider.x = -this.container.w - move_step;
					this.state = HIDDEN;
				}				
				this.timerID = setTimeout(this.shortcut + ".move();", time_step);
			break;
			case VISIBLE:
			break;
			case HIDDEN:
				this.container.style.visibility = "hidden";
			break;
			default:
				this.state = HIDDEN;
			break;
		}
		this.slider.setProps();
	} 
	this.copy = function()
	{
		var newsubmenus = new Array();
		for (var i=0; i<this.submenus.length; i++)
			newsubmenus[newsubmenus.length] = this.submenus[i].copy();			
		return new aksmenu(this.content, newsubmenus, this.password);
	}
}

//-------------------------------------------------

function setCookie(name, value, savefor, path, domain, secure)
{
	var expires = null;
	if (savefor)
	{
		now = new Date();
		now.setTime(Date.parse(now) + savefor*24*60*60*1000);
		expires = now.toGMTString();
	}

	var curCookie = name + "=" + escape(value) +
		((expires) ? ";expires=" + expires : "") +
		((path) ? ";path=" + path : "") +
		((domain) ? ";domain=" + domain : "") +
		((secure) ? ";secure" : "");
		document.cookie = curCookie;
}

function getCookie(name)
{
	var prefix = name + "="
	var cookieStartIndex = document.cookie.indexOf(prefix)
	if (cookieStartIndex == -1)
		return false
	var cookieEndIndex = document.cookie.indexOf(";", cookieStartIndex + prefix.length)
	if (cookieEndIndex == -1)
		cookieEndIndex = document.cookie.length
	return unescape(document.cookie.substring(cookieStartIndex + prefix.length, cookieEndIndex));
}


function safeAttachEvent(my_event, handler)
{
	if (eval(my_event))
	{
		var old_handler = eval(my_event);
		eval(my_event + " = function(){old_handler();handler();}");
	}
	else
		eval(my_event + " = function(){handler();}");
}

//-------------------------------------------------

function MakeMenu(template)
{
	document.writeln("<SPAN id=\"_aksmenu\"></SPAN>");
	try
	{
		var xmldom = new ActiveXObject("Microsoft.XMLDOM");
		xmldom.onreadystatechange = function()
		{
			if (xmldom.readyState == 4)
			{
				var parseXMLmenu = function(xml_node)
				{
					var submenus = new Array();
					var content, password;
					if (!xml_node) return new aksmenu("XML error", new Array(new aksmenu("Íå óäàëîñü çàãðóçèòü XML-ôàéë ñòðóêòóðû ìåíþ.")));
					for (var i = 0; i < xml_node.childNodes.length; i++)
						switch (xml_node.childNodes.item(i).nodeName)
						{
							case "menuItem": submenus[submenus.length] = parseXMLmenu(xml_node.childNodes.item(i));
							break;
							case "content": content = xml_node.childNodes.item(i).text;
							break;
							case "password": password = xml_node.childNodes.item(i).getAttribute("value");
							break;
						}
					return new aksmenu(content, submenus, password)
				}
				menu = parseXMLmenu(xmldom.documentElement);
				if (document.readyState == "interactive" || document.readyState == "complete")
				{
					menu.place(_aksmenu);
					menu.allocate();
				}
				else
					safeAttachEvent("window.onload", function(){menu.place(_aksmenu);menu.allocate();});
			}
		}
		xmldom.load(template);
	}
	catch (e)
	{
		menu = new aksmenu("XML error", new Array(new aksmenu("Íå cðàáîòàë XML-çàãðóç÷èê: <br />" + e.description)));
		safeAttachEvent("window.onload", function(){menu.place(_aksmenu);menu.allocate();});
	}
}
