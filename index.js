
// Clean often to keep heap use to min
function doGC()
{
	global.gc();

	setTimeout(doGC, 5000);
}

if (global.gc)
	doGC();