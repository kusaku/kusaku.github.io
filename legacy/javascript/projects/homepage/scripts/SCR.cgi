#!bin/perl

	######################
	# Guest Book for CGI #
	#     (c) kusaku     #
	# No rights reserved #
	######################

################################################################################################

sub ReqDecoder
{
	my($str, @qstr, $t1, $t2);
	$str = $_[0];
	$str =~ s/\+/ /g;
	@qstr = split(/&/,$str);
	foreach $i (@qstr)
	{
		if ($i =~ /=/)
		{
			$t1 = $`;
			$t2 = $';   
			$t1 =~ s/%([0-9A-H]{2})/pack('C',hex($1))/egi;
			$t2 =~ s/%([0-9A-H]{2})/pack('C',hex($1))/egi;
			$t1 =~ tr/a-z/A-Z/;
			$hash{$t1} = $t2;
		}            
	}

	return %hash;
}

################################################################################################

sub WriteBook
{
   	my($ans, $ok, $test, @time);
    $ans = "<font color=red>РЕЗУЛЬТАТ:</font><br>\n";
    $ok = 0;

	open (lastreq, "<lastreq.dat") || sub {$ans .= "<font color=red>Файла данных запроса нет - не могу прочитать!</font><br>\n";};
	$test = <lastreq>;
	close (lastreq);

	if ($q eq $test)
	{
	    return $ans."<font color=orange>Повторный запрос - отклонен...</font><br>\n";
	}
	else
	{
	   	open (lastreq, ">lastreq.dat") || sub {$ans .= "<font color=red>Файла данных запроса нет - не могу записать!</font><br>\n";};
		print lastreq $q;
		close (lastreq);
	}

    if ($req{'NICK'} =~ /\S/)
    {
		$ok++;
    }
    else
    {
    	$ans .= "<font color=orange>Имя не должено быть пустым!</font><br>\n";
	}

	if ($req{'MAIL'} =~ /[0-9A-Z\.\-\_]+@([0-9A-Z\-]+\.){1,3}([A-Z]){2,4}/i)
	{
		$req{'MAIL'} = $&;
		$ok++;
	}
	elsif ($req{'MAIL'} !~ /\S/)
	{
		$ans .= "<font color=lightblue>Почтовый адрес отсутствует...</font><br>\n";
		$ok++;
	}
   	else
	{
		$ans .= "<font color=orange>Странный адрес: &quot;$req{'MAIL'}&quot;...</font><br>\n";
	}

	if ($req{'PAGE'} =~ /(\d)+\.(\d)+\.(\d)+\.(\d)+.*/i || $req{'PAGE'} =~ /((\w)+\.){1,4}(\w){2,4}.*/)
    {
        $req{'PAGE'} = "https://" . $&;
		$ok++;
    }
    elsif ($req{'PAGE'} !~ /\S/)
    {
    	$ans .= "<font color=lightblue>Адрес страницы отсутствует...</font><br>\n";
   		$ok++;
	}
    else
    {
    	$ans .= "<font color=orange>Плохой адрес у страницы...<font><br>\n";
	}

    if ($req{'MSG'} =~ /\S/)
    {
       	$req{'MSG'} =~ s/&/&amp;/g;
    	$req{'MSG'} =~ s/</&lt;/g;
    	$req{'MSG'} =~ s/>/&gt;/g;
    	$req{'MSG'} =~ s/\r\n/<br>/g;
        if ($req{'MSG'} =~ /ху[йеяе]/i || $req{'MSG'} =~ /пизд/i || $req{'MSG'} =~ /бля/i || $req{'MSG'} =~ /fuck/i)
	    {
			$ans .= "<font color=orange>У нас не матерятся: &quot;..$&..&quot;...</font><br>\n";
		}
		else
		{
			$ok++;
		}
    }
    else
    {
    	$ans .= "<font color=orange>Пустое cообщение!</font><br>\n";
	}

    if ($ok == 4)
    {
	    open(gb, ">>guestbook.txt") || sub {$ans .= "<font color=red>Не могу открыть файл записей!</font><br>\n";};
		print gb "<gbrec>\n";
		print gb "From > $ENV{'REMOTE_ADDR'}\n";
		print gb "Browser > $ENV{'HTTP_USER_AGENT'}\n";
		print gb "Referer > $ENV{'HTTP_REFERER'}\n";
		print gb "MAIL > $req{'MAIL'}\n";
		print gb "NICK > $req{'NICK'}\n";
		print gb "PAGE > $req{'PAGE'}\n";
		print gb "MSG > $req{'MSG'}\n";
		@time = localtime(time);
		@time[0] = (@time[0] < 10) ? "0".@time[0] : @time[0];
		@time[1] = (@time[1] < 10) ? "0".@time[1] : @time[1];
		@time[2] = (@time[2] < 10) ? "0".@time[2] : @time[2];
		@time[3] = (@time[3] < 10) ? "0".@time[3] : @time[3];
   		@time[4]++;
		@time[4] = (@time[4] < 10) ? "0".@time[4] : @time[4];
        @time[5] = @time[5] + 1900;
		print gb "TIME > @time[3].@time[4].@time[5]&nbsp;@time[2]:@time[1]:@time[0]\n";
		print gb "</gbrec>\n\n";
        close(gb);
		$count++;
        open(st, ">stat.dat") || return $ans."<font color=red>Не могу записать в файл данных!</font><br.\n";
			print st $count."\n";
		close(st);
		$ans .= "Запись успешно добавлена!<br>\n";
        $succAdd = "true";
	}
	else
	{
		$ans .= "<font color=red>Запись не может быть добавлена!</font><br>\n";
        $succAdd = "false";
	}

    return $ans;
}

################################################################################################

sub GuestBook
{
   	my($ans, $i, $str, %current);
	$ans = "\n\n<!-- here guestbook begins -->\n\n";
	open(gb, "guestbook.txt") || sub {$ans .= "<font color=red>Файла записей нет - добавьте хотя бы одну запись!</font><br>\n";};
	$i = 0;
	do
	{
		while (($str = <gb>) && ($str !~ /<gbrec>/i)) {} #нашли начало записи (или конец файла)
		while (($str = <gb>) && ($str !~ /<\/gbrec>/i)) #обработка, пока не конец записи или файла
	    {
		    chomp($str);
		    $current{$`} = $' if ($str =~ / > /); #если подходит под шаблон - добавляем в хеш
		}
		if (%current)
		{
			$i++;
			if ($i >= $_[0] && $i <= $_[1])
			{
				$ans .= "<br>\n";
				$ans .= "<TABLE class='simple' width=90%>\n";
				$ans .= "<TR>\n";
				$ans .= " <TD width=5%>#$i</TD>\n";
				$ans .= " <TD width=10%>$current{'TIME'}</TD>\n";
				$ans .= " <TD width=55%>Господин " . (($current{'MAIL'}) ? "<A href='mailto:".$current{'MAIL'}."'>$current{'NICK'}</A>" : $current{'NICK'}) . " пишет:</TD>\n";
				$ans .= " <TD width=30%>" . (($current{'PAGE'}) ? "<A href='".$current{'PAGE'}."'>страница</A>" : "(нет страницы)") . "</TD>\n";
				$ans .= "</TR>\n";
				$ans .= "<TR>\n";
				$ans .= " <TD colSpan=4>$current{'MSG'}</TD>\n";
				$ans .= "</TR>\n";
				if ($imboss)
				{
				$ans .= "<TR>\n";
				$ans .= " <TD colSpan=1><center><a href=?readfrom=$req{'READFROM'}&readto=$req{'READTO'}&authority=$req{'AUTHORITY'}&action=sanitarize&what=$i>удалить</a></center></TD>\n";
				$ans .= " <TD colSpan=2><center>$current{'Browser'}</center></TD>\n";
				$ans .= " <TD colSpan=1><center>$current{'From'}</center></TD>\n";
				$ans .= "</TR>\n";
				}
				$ans .= "</TABLE>\n";
		    }
		}
		%current = ''; #убили хеш
	}
	until (eof);
	$ans .= "<font color=red>Гостевая книга пуста - добавьте хотя бы одну запись!</font><br>\n" if ($i == 0);
   	close(gb);
	$ans .= "\n\n<!-- here guestbook ends -->\n\n";

	return $ans;
}

################################################################################################

sub SanitarizeGuestBook
{
   	my($ans, $i, $str);
    $ans = "<font color=red>Обработка гостевой книги:</font><br>\n";
    open(newgb,">>guestbook.tmp") || return $ans."<font color=red>Не могу создать новый файл записей!</font><br>\n";
	open(gb, "guestbook.txt") || return $ans."<font color=red>Не могу открыть старый файл записей!</font><br>\n";
	$i = 0;
	$count = 0;
	do
	{
		while (($str = <gb>) && ($str !~ /<gbrec>/i)) {} #нашли начало записи (или конец файла)
		while (($str = <gb>) && ($str !~ /<\/gbrec>/i)) #обработка, пока не конец записи или файла
	    {
		    chomp($str);
		    $current{$`} = $' if ($str =~ / > /); #если подходит под шаблон - добавляем в хеш
		}
		if (%current)
		{
			$i++;
			if ($i != $_[0])
			{
				$count++;
				print newgb "\n<gbrec>\n";
				foreach $key (sort(keys %current))
				{
					print newgb "$key > $current{$key}\n";
				}
				print newgb "<\/gbrec>\n";
		    }
		}
		%current = ''; #убили хеш
	}
	until (eof gb);
	$ans .= "<font color=red>Гостевая книга пуста - нечего обрабатывать!</font><br>\n" if ($i == 0);
   	close(gb);
   	close(newgb);

    unlink "guestbook.txt";
    rename "guestbook.tmp", "guestbook.txt";

	open(st, ">stat.dat") || return $ans."<font color=red>Не могу записать в файл данных!</font><br.\n";
		print st $count."\n";
	close(st);

	return $ans."Обработано $count записей (было $i).\n";
}

################################################################################################

sub Numbers
{
   	my($ans, $i, $k);
  	$ans = "\n\n<!-- here numbers begin -->\n\n";
	$ans .= "<div style='width=90%;'>\n";
	for ($i = 1; $i < $count; $i+=$_[0])
	{
		$k = $i + $_[0];
		$k = $count if $k > $count;
		if ($i >= $req{'READFROM'} && $k <= $req{'READTO'})
		{
			$ans .= "[$i..$k]\n";
		}
		else
		{
	        $ans .= "<a href=?readfrom=$i&readto=$k" . (($imboss) ? "&authority=$req{'AUTHORITY'}" : "") . ">[$i..$k]</a>\n";
	    }
	}
   	$ans .= "</div>\n";
   	$ans .= "\n\n<!-- here numbers end -->\n\n";
   	return $ans;
}

################################################################################################

sub CheckBoss
{
	my($pw,$ans);
	if (open(pwf, "passwd.dat"))
	{
		$pw = <pwf>;
		$ans = ($_[0] eq $pw);
      	close(pwf);
	}
	else
	{
		open(pwf, ">passwd.dat");
		print pwf $_[0];
		$ans = true;
      	close(pwf);
	}
	return $ans;
}

################################################################################################

sub Error
{
	print $_[0];
}

################################################################################################

if ($ENV{'REQUEST_METHOD'} =~ /get/i)
{
	$q = ($ENV{'QUERY_STRING'});
}
if ($ENV{'REQUEST_METHOD'} =~ /post/i)
{
	sysread STDIN, $q = ($ENV{'QUERY_STRING'}), $ENV{'CONTENT_LENGTH'};
}

%req = ReqDecoder($q);

################################################################################################

print "Content-Type: text/html\n\n";
print <<EOF;
<html>
<head>
<title>Гостевая книга</title>
<link rel="stylesheet" href="https://127.0.0.1/physfac/html/style.css" type="text/css">
</head>
<body>
<h1>Гостевая книга</h1>
<h3>Не ругайтесь громко!</h3>
EOF

################################################################################################

$imboss = CheckBoss($req{'AUTHORITY'}) if ($req{'AUTHORITY'});

open(st, "stat.dat") || Error("<font color=red>Файла данных нет - необходимо инициализировать счетчик!</font><br>\n");
	$count = <st>;
   	$count = $& if ($count =~ /\d+/g);
close(st);

$succAdd = "true";

$a = WriteBook if ($req{'ACTION'} =~ /add/i);

$b = SanitarizeGuestBook($req{'WHAT'}) if ($req{'ACTION'} =~ /sanitarize/i && $imboss);

if (!$req{'READFROM'} || !$req{'READTO'} || $req{'READFROM'} > $count || $req{'READFROM'} > $req{'READTO'})
{
	$req{'READFROM'} = $count - int($count/20) - 10;
	$req{'READTO'} = $count;
}

print "<hr>";
print Numbers(int($count/20) + 10);
print "<hr>";

print "$b<hr>" if ($b);
print GuestBook($req{'READFROM'}, $req{'READTO'});

print "<hr>";
print Numbers(int($count/20) + 10);
print "<hr>";
print "<a href=?action=sanitarize&authority=boss>|Почистить книгу|</a><a href=?>|Выйти из режима хозяина|</a><hr>" if ($imboss);
print "$a<hr>" if ($a);

################################################################################################

if ($succAdd eq "true")
{
print <<EOF;

Добавьте новую запись:
<form action=https://127.0.0.1/cgi-bin/scr.cgi method=post>
<table class='simple'>
  <tr>
    <td><center>ваше имя:<input name=nick><font color=#f09900>*</font></center></td>
    <td rowspan=4><textarea cols=50 name=msg rows=7 width="100%"></textarea><font color=#f09900>*</font></td>
  <tr>
    <td><center>ваш mail:<input name=mail></center></td>
  </tr>
  <tr>
    <td><center>страница:<input name=page></center></td>
  </tr>
  <tr>
    <td><center><font color=#f09900>*</font> - обязательные
      поля</center></td>
  </tr>
  <tr>
    <td colspan=2>
    <center>
    <input name=action type=hidden value=add>
    <input type=submit value="добавить запись">
    </center>
    </td>
  </tr>
</table>
</form>

EOF
}
else
{
$req{'MSG'} =~ s/<br>/\n/g;
print <<EOF;

Исправьте свою запись:
<form action=https://127.0.0.1/cgi-bin/scr.cgi method=post>
<table class='simple'>
  <tr>
    <td><center>ваше имя:<input name=nick value="$req{'NICK'}"><font color=#f09900>*</font></center></td>
    <td rowspan=4><textarea cols=50 name=msg rows=7 width="100%">$req{'MSG'}</textarea><font color=#f09900>*</font></td>
  <tr>
    <td><center>ваш mail:<input name=mail value="$req{'MAIL'}"></center></td>
  </tr>
  <tr>
    <td><center>страница:<input name=page value="$req{'PAGE'}"></center></td>
  </tr>
  <tr>
    <td><center><font color=#f09900>*</font> - обязательные
      поля</center></td>
  </tr>
  <tr>
    <td colspan=2>
    <center>
    <input name=action type=hidden value=add>
    <input type=submit value="добавить запись">
    </center>
    </td>
  </tr>
</table>
</form>

EOF
}

################################################################################################

print <<EOF;
<hr>
<p>О всех ошибках просьба сообщать на e-mail: <A href="mailto:aks\@nm.ru?subject=webmaster">aks\@nm.ru</a></p>
</body>
</html>
EOF

################################################################################################


