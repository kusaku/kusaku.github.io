function imgOpen(href, w, h, cButt, autoClose)
{
	features = "fullscreen=no,toolbar=no,location=no,directories=no,status=no,menubar=no,scrollbars=no,resizable=no,";
	if (w==0 || h==0)
	{
		if (cButt)
			setTimeout("my_hwnd.resizeTo(img.width + 12, img.height + 55)", 1000);
		else
			setTimeout("my_hwnd.resizeTo(img.width + 12, img.height + 31)", 1000);
	}	
	else
	{
		features += "width=" + ((w && w > 100) ? w : 100) + ",";
		features += "height=" + ((h && !cButt) ? h : (h + 24)) + "";
	}
	if (autoClose) setTimeout("my_hwnd.close()", autoClose*1000);
	my_hwnd = window.open("about:blank", null, features);
	img = my_hwnd.document.createElement("IMG")
	img.src = href;
	if (w!=0 && h!=0)
	{
		img.width = w;
		img.height = h;
	}
	div = my_hwnd.document.createElement("DIV");
	div.style.textAlign = "right"
	div.innerHTML = "<INPUT type='button' value='�������' onclick='window.close()'>"
	my_hwnd.document.body.style.margin = "0px";
	setTimeout("my_hwnd.document.body.appendChild(img)", 100);
	if (cButt) setTimeout("my_hwnd.document.body.appendChild(div)", 100);
}