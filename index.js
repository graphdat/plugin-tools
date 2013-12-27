var _os = require('os');
var _fs = require('fs');

// Clean often to keep heap use to min
function doGC()
{
	global.gc();

	setTimeout(doGC, 5000);
}

if (global.gc)
	doGC();

function silent(fnc)
{
	try
	{
		return fnc();
	}
	catch(ex)
	{
		return undefined;
	}
}

/***
 * Finds a process id given optional name, path, and CWD regex.
 *
 * @param [cfg.processName] 	Regex for name of process
 * @param [cfg.processPath] 	Regex for full path of process
 * @param [cfg.processCwd] 		Regex for current working directory of process
 * @param [cfg.reconcile]		Reconcile technique if multiple found, can be:
 * 									first		use the first one found
 * 									parent		use the one that is parent of others
 * @returns {*}					Will be an object { pid, reason }, reason filled in if error
 */
function findProcId(cfg)
{
	if (_os.platform() !== 'linux')
		return { pid : 0, reason : 'OS not supported'};
	if (!_fs.existsSync('/proc'))
		return { pid : 0, reason : 'OS is missing procfs'};

	// Get all proc id's
	var procs = _fs.readdirSync('/proc').filter(function(e) { return !isNaN(parseInt(e)); });

	var hits = [];

	var reason;

	var res = procs.every(function(pid)
	{
		var stat = _fs.readFileSync('/proc/' + pid + '/stat', 'utf8').split(' ');
		var cwd = silent(function() { return _fs.readlinkSync('/proc/' + pid + '/cwd'); });
		var path = silent(function() { return _fs.readlinkSync('/proc/' + pid + '/exe'); });
		var re;

		var prc = {
			name : stat[1].substr(1, stat[1].length - 2),
			path : path || '',
			cwd : cwd || '',
			pid : pid,
			ppid : parseInt(stat[3]),
			start : parseInt(stat[21])
		};

		if (cfg.processName)
		{
			re = new RegExp(cfg.processName);
			if (!re.test(prc.name))
				return true;
		}
		if (cfg.processPath)
		{
			re = new RegExp(cfg.processPath);
			if (!prc.path)
			{
				reason = 'A path regex was specified but path was not readable, this may be a security issue';
				return false;
			}
			if (!re.test(prc.path))
				return true;
		}
		if (cfg.processCwd)
		{
			re = new RegExp(cfg.processCwd);
			if (!prc.cwd)
			{
				reason = 'A CWD regex was specified but CWD was not readable, this may be a security issue';
				return false;
			}
			if (!re.test(prc.cwd))
				return true;
		}

		// got a hit
		hits.push(prc);

		return true;
	});

	if (!res)
		return { pid : 0, reason : reason };

	if (hits.length === 0)
		return { pid : 0 , reason : 'Unable to find a process'};
	else if (hits.length == 1)
		return { pid : hits[0].pid };
	else
	{
		// More than one hit, reconcile
		if (!cfg.reconcile)
			return { pid : 0, reason : 'Multiple processes found but no way to reconcile to one'};

		if (cfg.reconcile === 'first')
			return { pid : hits[0].pid };
		else if (cfg.reconcile === 'parent')
		{
			// Scan all processes, find the one that is parent of all
			var parent;
			for(var i = 0; i < hits.length; i++)
			{
				var h = hits[i];

				if (hits.some(function(e) { return e.pid != h.pid && e.pid == h.ppid; }  ))
				{
					// We have a parent in the set, carry on
				}
				else
				{
					// No parent in the set, this is either the parent or we are ambiguous
					if (parent)
						return { pid : 0 , reason : 'Multiple processes found which are not all children' };

					parent = h;
				}
			}

			return { pid : parent.pid };
		}
		else if (cfg.reconcile === 'uptime')
		{
			// Find earliest start
			var earliest;
			hits.forEach(function(e)
			{
				if (!earliest || e.start < earliest.start)
					earliest = e;
			});

			return { pid : earliest.pid };
		}
		else
		{
			return { pid : 0, reason : 'Unknown reconciliation' };
		}
	}
}

/***
 * Formats the source for Graphdat
 *
 * Graphdat does not allow spaces in the source name
 *
 */

function formatSource(source)
{
	source = source || '';
	return source.replace(/\s/g, '-');
}

module.exports = {
	findProcId : findProcId,
	formatSource : formatSource
};
