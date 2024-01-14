//-------------------------------------------------
// by kusaku 10 june 2004

var maxZIndex = 100;
var isIE5 = typeof document.all != "undefined" && !document.addEventListener;

function bringToFront(fly)
{
	var all = isIE5 ? document.all : document.querySelectorAll('[name="floater"]');
	var max = maxZIndex;
	for (var i = 0; i < all.length; i++)
	{
		var elem = all[i];
		if (elem.getAttribute && elem.getAttribute("name") != "floater") continue;
		var z = parseInt(elem.style.zIndex) || 0;
		if (z > max) max = z;
	}
	fly.style.zIndex = max + 1;
}

function SafeAttachEvt(my_event, handler)
{
	if (isIE5)
	{
		if (eval(my_event))
		{
			var old_handler = eval(my_event);
			eval(my_event + " = function(){old_handler();handler();}");
		}
		else
			eval(my_event + " = function(){handler();}");
	}
	else
	{
		var elem = my_event.split(".")[0];
		var evt = my_event.split(".")[1];
		if (elem == "document") elem = document;
		else if (elem == "window") elem = window;
		if (elem.addEventListener) elem.addEventListener(evt.replace("on", ""), handler);
	}
}

function addFloater(fly)
{
	if (fly.getAttribute("name") != "floater") return;
	fly.moveEnabled = false;
	fly.shrinkEnabled = false;
	fly.dleft = 0;
	fly.dtop = 0;
	fly.fulldleft = 2;
	fly.fulldtop = 2;
	if (isIE5)
	{
		var fullname = "document.all[" + fly.sourceIndex + "]";
		SafeAttachEvt("document.onmouseup", function() {eval(fullname).stopdrag();});
		SafeAttachEvt("document.onmousemove", function() {eval(fullname).move();});
		SafeAttachEvt(fullname + ".onmousedown", function(){bringToFront(fly);});
	}
	else
	{
		document.addEventListener("mouseup", function(e) {fly.stopdrag();});
		document.addEventListener("mousemove", function(e) {fly.move(e);});
		fly.addEventListener("mousedown", function(e){bringToFront(fly);});
	}
	var make_things = function(obj, name)
	{
		if (obj.getAttribute(name) == "mover")
		{
			if (isIE5)
			{
				var dig = obj;
				while (dig.offsetParent && dig != fly)
				{
					fly.fulldleft += dig.offsetLeft;
					fly.fulldtop += dig.offsetTop;
					dig = dig.offsetParent
				}
				var thisname = "document.all[" + obj.sourceIndex + "]";
				var fullname = "document.all[" + fly.sourceIndex + "]";
				SafeAttachEvt(thisname + ".onmousedown", function(){eval(fullname).startdrag()});
			}
			else
			{
				obj.addEventListener("mousedown", function(e){fly.startdrag(e)});
			}
		}
		else if (obj.getAttribute(name) == "shrinker")
		{
			if (isIE5)
			{
				var thisname = "document.all[" + obj.sourceIndex + "]";
				var fullname = "document.all[" + fly.sourceIndex + "]";
				SafeAttachEvt(thisname + ".onclick", function(){eval(fullname).shrink()});
			}
			else
			{
				obj.addEventListener("click", function(e){fly.shrink()});
			}
		}
		else if (obj.getAttribute(name) == "closer")
		{
			if (isIE5)
			{
				var thisname = "document.all[" + obj.sourceIndex + "]";
				var fullname = "document.all[" + fly.sourceIndex + "]";
				SafeAttachEvt(thisname + ".onclick", function(){eval(fullname).close()});
			}
			else
			{
				obj.addEventListener("click", function(e){fly.close();});
			}
		}
		else if (obj.getAttribute(name) == "content")
		{
			fly.content = obj;
		}		
		for (var i = 0; i < obj.children.length; i++)
		{			
			make_things(obj.children[i], name)
		}
	}
	make_things(fly, "name")
	fly.shrink = function()
	{
		this.shrinkEnabled = !this.shrinkEnabled;
		if (this.content) this.content.style.display = (this.shrinkEnabled) ? "none" : "";	
	}
	fly.close = function()
	{
		this.style.display= "none";
	}
	fly.startdrag = function(e)
	{
		if (isIE5)
		{
			this.dleft = event.offsetX;
			this.dtop = event.offsetY;
		}
		else
		{
			var rect = fly.getBoundingClientRect();
			var scrollLeft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
			var scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
			this.dleft = e.clientX - rect.left;
			this.dtop = e.clientY - rect.top;
		}
		this.moveEnabled = true;
	}
	fly.stopdrag = function()
	{
		this.moveEnabled = false;
	}
	fly.move = function(e)
	{
		if (isIE5)
		{
			if (!this.moveEnabled) return;
			if (event.x < 15 || event.y < 15) return;
			this.style.left = (event.x - this.dleft - this.fulldleft) + "px";
			this.style.top = (event.y - this.dtop - this.fulldtop) + "px";
		}
		else
		{
			if (!this.moveEnabled) return;
			if (e.clientX < 15 || e.clientY < 15) return;
			var scrollLeft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
			var scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
			this.style.left = (e.clientX - this.dleft + scrollLeft) + "px";
			this.style.top = (e.clientY - this.dtop + scrollTop) + "px";
		}
	}
}

if (isIE5)
{
	SafeAttachEvt("window.onload", function(){
		for(var i=0;i<document.all.length;i++)addFloater(document.all[i]);
	});
}
else
{
	window.addEventListener("load", function(){
		var all = document.querySelectorAll("*");
		for(var i=0;i<all.length;i++)addFloater(all[i]);
	});
}