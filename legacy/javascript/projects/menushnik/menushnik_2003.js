//since october 2003

var DOWN = 0
var UP = 1;
var VISIBLE = 2;
var HIDDEN = 3;
var MOUSEOUT = 0;
var MOUSEOVER = 1;
var MOUSEDOWN = 2
var MOUSEUP = 3;
var globalTimer = null;
var menu = null;
var menuHash = new Array();
var startMenu = function(){};

var hide_timeout = 1000
var move_step = 5;
var time_step = 10;
var border_size = 1;
var enm = 0;

function LDRect(obj, visible, cname)
{
	this.obj = obj;
	this.x;
	this.y;
	this.w;
	this.h;
	this.visible = (visible) ? true : false;
	this.cname = (cname) ? cname : "";
	this.setProps = function()
		{
			this.obj.style.posLeft = this.x;
			this.obj.style.posTop = this.y;
			this.obj.style.width = this.w;
			this.obj.style.height = this.h;
		}
	this.getProps = function()
		{
			this.x = this.obj.offsetLeft;
			this.y = this.obj.offsetTop;
			this.w = this.obj.offsetWidth;
			this.h = this.obj.offsetHeight;
			var dig = this.obj;
			while (dig = dig.offsetParent)
			{
				this.x += dig.offsetLeft;
				this.y += dig.offsetTop;
			}
		}
	this.update = function()
		{
			this.obj.style.visibility = (this.visible) ? 'inherit' : 'hidden';
			this.obj.className = this.cname;
		}
	this.getProps();
}

function PDMenu(id, text, classNames, subs, password)
{
	this.id = id;
	this.text = text;
	this.passive_class = classNames[0];
	this.active_class = classNames[1];
	this.hover_class = classNames[2];
	this.state = VISIBLE;
	this.subs = (subs) ? subs : new Array();
	this.parent = null;
	this.sfo = null;
	this.cto = null;
	this.mvo = null;
	this.pro = null;
	this.timerID = null;
	this.isRoot = false;
	this.password = password;
	this.locked = (password) ? (password != getCookie(id)) : false;
//	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-
	this.Show = function()
	{
		if (this.subs.length == 0 || this.locked) return;
		if (this.state == DOWN || this.state == VISIBLE) return;
		if (this.state == UP)
			clearTimeout(this.timerID);
		this.state = DOWN;
		this.cto.visible = true;
		this.cto.update();
		this.Move();
	}
//	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-
	this.Hide = function()
	{
		if (this.subs.length == 0) return;
		if (this.state == UP || this.state == HIDDEN) return;
		for (var i=0; i<this.subs.length; i++)
			this.subs[i].Hide();
		if (this.state == DOWN)
			clearTimeout(this.timerID);
		this.state = UP;
		this.Move();
	}
//	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-
	this.Move = function()
	{
		clearTimeout(this.timerID);
		switch (this.state)
		{
			case DOWN:
				if (this.mvo.y < -move_step)
					this.mvo.y += move_step;
				else
				{
					this.mvo.y = 0;
					this.state = VISIBLE;
				}
				this.timerID = setTimeout("menuHash." + this.id + ".Move();", time_step);
			break;
			case UP:
				if (this.mvo.y > -this.mvo.h)
					this.mvo.y -= move_step;
				else
				{
					this.mvo.y = -this.mvo.h - move_step;
					this.state = HIDDEN;
				}
				this.timerID = setTimeout("menuHash." + this.id + ".Move();", time_step);
			break;
			case VISIBLE:
			break;
			case HIDDEN:
				this.cto.visible = false;
				this.cto.update();
			break;
			default:
				this.state = HIDDEN;
			break;
		}
		this.mvo.setProps();
	}
//	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-
	this.Hooker = function(action)
	{
		switch (action)
		{
			case MOUSEOVER:
				if (this.parent) this.parent.Hooker(MOUSEOVER);
				for (var i=0; i<this.subs.length; i++)
				{
					this.subs[i].sfo.cname = this.passive_class;
					this.subs[i].sfo.update();
					this.subs[i].Hide();
				}
				this.sfo.cname = this.hover_class;
				this.sfo.update();
				this.Show();
				clearTimeout(globalTimer);
			break;
			case MOUSEOUT:
				this.sfo.cname = this.passive_class;
				this.sfo.update();
				this.Hide();
				if (!this.isRoot)
					globalTimer = setTimeout("menu.Hooker(MOUSEOUT);", hide_timeout);
			break;
			case MOUSEDOWN:
				this.sfo.cname = this.active_class;
				this.sfo.update();
			break;
			case MOUSEUP:
				this.sfo.cname = this.hover_class;
				this.sfo.update();
				if (this.state==DOWN || this.state==VISIBLE) this.Hide();
				else if (this.state==UP || this.state==HIDDEN) this.Show();
			break;
		}
	}
//	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-
	this.Allocate = function()
	{
		if (this.subs.length == 0)
		{
			this.sfo.setProps();
			return;
		}

		var mw = 0;
		var mh = 0;
		
		for (var i=0; i<this.subs.length; i++)
		{
			this.subs[i].pro.y = this.pro.y + mh;
			this.subs[i].sfo.x = 0;
			this.subs[i].sfo.y = mh;
			mh += this.subs[i].sfo.h - border_size;
			mw = Math.max(mw,this.subs[i].sfo.w);
		}

		this.mvo.x = 0;
		if (this.state == HIDDEN) this.mvo.y = -mh - move_step;
		else if (this.state == VISIBLE) this.mvo.y = 0;
		this.mvo.w = mw;
		this.mvo.h = mh;
		this.cto.x = this.pro.x + this.pro.w - border_size;
		this.cto.y = this.pro.y;
		this.cto.w = mw;
		this.cto.h = mh + border_size;
		
		for (var i=0; i<this.subs.length; i++)
		{
			this.subs[i].pro.x = this.cto.x;
			this.subs[i].pro.w = mw;
			this.subs[i].pro.h = this.subs[i].sfo.h;
			this.subs[i].sfo.w = mw;
			this.subs[i].Allocate();
		}

		this.sfo.setProps();
		this.cto.setProps();
		this.mvo.setProps();
	}
//	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-
	this.Initialize = function()
	{
		this.pro = new LDRect(document.all.item("sfo" + this.id), true, this.passive_class);
		this.sfo = new LDRect(document.all.item("sfo" + this.id), true, this.passive_class);
		if (this.subs.length > 0)
		{
			this.cto = new LDRect(document.all.item("cto" + this.id), true, null);
			this.mvo = new LDRect(document.all.item("mvo" + this.id), true, null);
			for (var i=0; i<this.subs.length; i++)
			{
				this.subs[i].parent = this;
				this.subs[i].Initialize();
			}
		}
		menuHash[this.id] = this;
	}
//	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-
	this.getCode = function()
	{
		var s = new String();
		s += this.getSFOCode();
		s += this.getCTOCode();
		return s;
	}
//	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-
	this.getSFOCode = function()
	{
		var s = new String();
		s += "<TABLE class=" + this.passive_class + " id=sfo" + this.id + "\n";
		s += "onmouseover=MouseHooker(MOUSEOVER,this)\n";
		s += "onmouseout=MouseHooker(MOUSEOUT,this)\n";
		s += "onmouseup=MouseHooker(MOUSEUP,this)\n";
		s += "onmousedown=MouseHooker(MOUSEDOWN,this)\n";
		if (!this.isRoot)
			s += "style=\"position:absolute;\">\n"
		else
			s += "style=\"position:inherit;\">\n"
		s += "<TR>\n";
		if (this.subs.length > 0)
		{
			s += "<TD align=left>\n";
			s += (this.locked) ? "<A title='это меню заблокировано' href=unlock.dhtml?" + this.id + ">" + this.text + "</A>" : this.text;
			s += "</TD>\n";
			s += "<TD align=right>\n";
			s += (this.locked) ? "<A title='это меню заблокировано' href=unlock.dhtml?" + this.id + "><IMG src=images/l.gif></A>" : "&gt;";
			s += "</TD>\n";
		}
		else
		{
			s += "<TD align=left>\n";
			s += (this.locked) ? "<A title='это меню заблокировано' href=unlock.dhtml?" + this.id + ">(закрыто) <IMG align=absmiddle src=images/l.gif></A>" : this.text;
			s += "</TD>\n";
		}
		s += "</TR>\n";
		s += "</TABLE>\n";
		return s;
	}
//	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-
	this.getCTOCode = function()
	{
		var s = new String();
		if (this.subs.length > 0)
		{
			s += "<DIV" + " id=cto" + this.id + " \n";
			s += "style=\"position:absolute;overflow:hidden;\">\n";
			s += "<DIV" + " id=mvo" + this.id + " \n";
			s += "style=\"position:absolute;\">\n"
			for (var i=0; i<this.subs.length; i++)
				s += this.subs[i].getSFOCode();
			s += "</DIV>\n";
			s += "</DIV>\n";
			for (var i=0; i<this.subs.length; i++)
				s += this.subs[i].getCTOCode();
		}
		return s;
	}
}

function MouseHooker(action, that)
{
	for (var i in menuHash)
		if (menuHash[i].sfo.obj == that)
			menuHash[i].Hooker(action);
}

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


function parseXMLmenu(xml_node)
{
	var childs = new Array();
	var text, password;
	var classNames = new Array("menu_p", "menu_a", "menu_h");
    if (!xml_node) return new PDMenu("itm" + enm++, "XML error", classNames, childs, password);
	for (var i = 0; i < xml_node.childNodes.length; i++)
		switch (xml_node.childNodes.item(i).nodeName)
		{
			case "menuItem": childs[childs.length] = parseXMLmenu(xml_node.childNodes.item(i));
			break;
			case "text": text = xml_node.childNodes.item(i).text;
			break;
			case "password": password = xml_node.childNodes.item(i).getAttribute("value");
			break;
			case "className": 
				classNames[0] = xml_node.childNodes.item(i).getAttribute("passive_class");
				classNames[1] = xml_node.childNodes.item(i).getAttribute("active_class");
				classNames[2] = xml_node.childNodes.item(i).getAttribute("hover_class");
			break;
		}
	return new PDMenu("itm" + enm++, text, classNames, childs, password);
}


function MakeMenu(template)
{
	if (!document.all) return;
	document.write("<SPAN id=__container></SPAN>");
	var xmldom = new ActiveXObject("Microsoft.XMLDOM");
	xmldom.onreadystatechange = function()
	{
		if (xmldom.readyState == 4)
		{
			menu = parseXMLmenu(xmldom.documentElement);
			menu.isRoot = true;
			__container.innerHTML = menu.getCode();
			startMenu();
		}
	}
	xmldom.load(template);
	var SafeAttachEvt = function (my_event, handler)
	{
		if (eval(my_event))
		{
			var old_handler = eval(my_event);
			eval(my_event + " = function(){old_handler();handler();}");
		}
		else
			eval(my_event + " = function(){handler();}");
	}
	SafeAttachEvt("window.onload", function(){if(menu){menu.Initialize();menu.Allocate();menu.Hide();}else{startMenu=function(){menu.Initialize();menu.Allocate();menu.Hide();}}});
}

document.writeln("<SCRIPT language=javascript src=heart.js></SCRIPT>");
document.writeln("<SCRIPT language=javascript src=tooltip.js></SCRIPT>");
