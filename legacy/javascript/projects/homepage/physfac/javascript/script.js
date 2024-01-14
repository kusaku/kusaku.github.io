/****************************
**                         **
**    ThroughAss Engine    **
**                         **
**      (с) kusaku 2001       **
**                         **
****************************/


var slideduration = 500;
var slidetimetick = 49;
var slidetime = 0;
var processing = menuraised = false;
var animateID, gotoID;
var borderStrip, menuStrip, slidevelocity, slideacceleration, counter;
var startpage = "news.html", errorpage = "missing.html";
var titlePrefix = new String("ФизФак@RU: ");
var gotoInterval = 500;
var maxgoToTrying = 50;
var counter;
var replicator = new Array(
	new Replic("<!--begin_for_nn-->","<!--"),
	new Replic("<!--end_for_nn-->","-->"),
	new Replic("<!--for_ie","<"),
	new Replic("for_ie-->",">")
);
var ie = false;
var pageLoaded = false;
var content = "";
var lastVPhref = "";

var imageDump = preLoader(
	"images/menu_p_active.gif",
	"images/menu_p_passive.gif",
	"images/border_bg.gif"
	);

function preLoader()
{
	this.image = new Array(arguments.length);
	for (i in arguments)
		{
			this.image[i] = new Image();
			this.image[i].src = arguments[i];
		}
	return this;
}

function addBookmark()
{
	if (navigator.appVersion.indexOf(4.0)>=0)
		window.external.addFavorite(self.window.location.href, "ФизФак@RU");
	else alert("Нажмите Ctrl+D для добавления закладки.");
}

function Replic(src, rep)
{
	this.src = new RegExp(src,"g");
	this.rep = rep;
	this.replace = new Function("content", "return content.replace(this.src, this.rep);");
	return this;
}

function goTo(href)
{
	if (href)
		{
			pageLoaded = false;
			clearInterval(gotoID);
			indicator.innerHTML = "Click <a href=" + href + " + target=_blank title=" + href + ">here</a> to view page in another window.";
			sheet.style.visibility = "hidden";
			viewport.document.body.innerHTML="";
			try
			{
				viewport.document.location.href = href;
			}
			catch(Exception)
			{
				self.status = "Href changing error: not 'document'";
			}
			finally
			{
				try
				{
					viewport.location.href = href;
				}
				catch(Exception)
				{
					self.status = "Href changing error: not 'location'";
				}
			}
			counter = 0;
			gotoID = setInterval("goTo()", gotoInterval);
		}
	else if (viewport.document.body && viewport.document.body.innerHTML!="" && viewport.document.readyState=="complete")
		{
			clearInterval(gotoID);
			content = viewport.document.body.innerHTML;
			/*
			for (i=0; i!=replicator.length; i++) content = replicator[i].replace(content);
			docBase = document.location.href.substring(0, Math.max(document.location.href.lastIndexOf("\\"), document.location.href.lastIndexOf("/")));
			vpBase =  viewport.location.href.substring(0, Math.max(viewport.location.href.lastIndexOf("\\"), viewport.location.href.lastIndexOf("/")));
			r = new Replic(vpBase, docBase);
			content = r.replace(content);
			*/
			sheet.innerHTML = content;
			window.location.hash = viewport.location.hash;
			window.document.title = titlePrefix + "[" + viewport.document.title + "]";
			setTimeout("PostProcessor();", 50);
			setTimeout("sheet.style.visibility = 'visible';", 100);
			pageLoaded = true;
		}
	else if (counter > maxgoToTrying)
		{
			clearInterval(gotoID);
			self.status = "Time elapsed, opening error page...";
			goTo(errorpage);
		}
	else counter++;
}

function PostProcessor()
{
	if (!viewport.document.images) return;
	try
	{
	for (i=0; i!=viewport.document.images.length; i++)
		self.document.images[i].src = viewport.document.images[i].src;

	/*for (i=0; i!=viewport.document.links.length; i++)
		self.document.links[i].href = viewport.document.links[i].href;*/
	}
	catch(Exception)
	{
		self.status = "PostProcess Error";
	}


}

function TraceVP()
{
	if (pageLoaded && viewport.location.href != lastVPhref) gotoID = setInterval("goTo()", gotoInterval);
}


function moveIt(target,how)
{
	if (slidetime < slideduration)
		switch (how)
		{
		case "rtl": target.left = Math.ceil(slideacceleration*slidetime*slidetime/2 - slidevelocity*slidetime);
					slidetime += slidetimetick;
					break;
		case "ltr": target.left = Math.ceil(slidevelocity*slidetime - slideacceleration*slidetime*slidetime/2) - menuStrip;
					slidetime += slidetimetick;
					break;
		}
	else
		{
			menuraised = !menuraised;
			clearInterval(animateID);
			setTimeout("processing = false;", 50);
			slidetime = 0;
		}
}

function mmProcess(raise)
{
	if (!processing && menuraised && !raise)
	{
		menu_p.className="menu_p_passive";
		processing=true;
		animateID = setInterval("moveIt(menu.style,'rtl')", slidetimetick);
	}
	if (!processing && !menuraised && raise)
	{
		menu_p.className="menu_p_active";
		processing=true;
		animateID = setInterval("moveIt(menu.style,'ltr')", slidetimetick);
	}
}

function clickProcess()
{
	obj = event.srcElement;
	for (i=0; i!=document.links.length; i++)
		if (obj == document.links[i])
		if (viewport.document.links[i])
		if (obj.protocol.toLowerCase() == "http:" || obj.protocol.toLowerCase() == "file:")
		if (obj.target.toLowerCase() != "_blank")
		{
			goTo(viewport.document.links[i].href);
			return false;
		}
	return true;
}

function FixView()
{
	menu.style.top = 0;
	menuraised ? menu.style.left = 0 : menu.style.left = - menuStrip;
	menu.style.height = Math.abs(document.body.offsetHeight - 4);
	sheet.style.top = 0;
	sheet.style.left = borderStrip;
	sheet.style.width = Math.abs(document.body.offsetWidth - borderStrip - 4);
	sheet.style.height = Math.abs(document.body.offsetHeight - 4);
}

function Start()
{
	menuStrip = menu.cells[0].offsetWidth;
	borderStrip = menu.cells[1].offsetWidth;
	slidevelocity = 2 * menuStrip / slideduration;
	slideacceleration = slidevelocity / slideduration;
	FixView();
	menu.style.visibility = "visible";
	goTo(startpage);
}

if (top!=self) top.location.href = self.location.href;

ie = (typeof(document.all)=="object");

if (ie)
{
	window.onerror = new Function("self.status = 'Ошибочка вышла!'; return false;");
	window.onresize = FixView;
	window.onload = Start;
	window.document.onclick = clickProcess;
	window.document.onmousemove = new Function("document.selection.empty()");
	/*window.document.oncontextmenu = new Function("return false");*/
}