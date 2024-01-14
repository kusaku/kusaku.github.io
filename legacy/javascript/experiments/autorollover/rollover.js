//-------------------------------------------------
// by kusaku 8 june 2004

var isIE5 = typeof document.all != "undefined" && !document.addEventListener;

function addrollOver(img)
{
	var dur = 0.25;
	try
	{		
		var src = img.name.split("|");
		if (src.length != 3) throw "Invalid image name format!";
		img.imgOff = new Image();
		img.imgOff.src = src[0];
		img.imgOn = new Image();
		img.imgOn.src = src[1];
		img.imgAct = new Image();
		img.imgAct.src = src[2];
		
		if (isIE5)
		{
			img.style.filter += " blendTrans";
			img.onmouseover = function() {this.fade("mouseover")};
			img.onmouseout = function() {this.fade("mouseout")};
			img.onmousedown = function() {this.fade("mousedown")};
			img.onmouseup = function() {this.fade("mouseup")};
			img.fade = function(event)
			{
				this.filters.blendTrans.stop();
				this.filters.blendTrans.apply();
				switch (event)
				{
					case "mouseout":
						this.src = this.imgOff.src;
						this.className = "imgOff";
					break;
					case "mouseover":
						this.src = this.imgOn.src;
						this.className = "imgOn";
					break;
					case "mousedown":
						this.src = this.imgAct.src;
						this.className = "imgAct";
					break;
					case "mouseup":
						this.src = this.imgOn.src;
						this.className = "imgOn";
					break;
				}
				this.filters.blendTrans.play(dur);
			}
		}
		else
		{
			img.onmouseover = function() {this.src = this.imgOn.src; this.className = "imgOn";};
			img.onmouseout = function() {this.src = this.imgOff.src; this.className = "imgOff";};
			img.onmousedown = function() {this.src = this.imgAct.src; this.className = "imgAct";};
			img.onmouseup = function() {this.src = this.imgOn.src; this.className = "imgOn";};
		}
	}
	catch (e)
	{
		return e;
	}
}

var SafeAttachEvt = function (my_event, handler)
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

if (isIE5)
{
	SafeAttachEvt("window.onload", function(){for(var i=0;i<document.images.length;i++)addrollOver(document.images[i]);});
}
else
{
	window.addEventListener("load", function(){for(var i=0;i<document.images.length;i++)addrollOver(document.images[i]);});
}