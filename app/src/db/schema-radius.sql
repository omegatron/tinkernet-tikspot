-- FreeRADIUS rlm_sql SQLite schema (matches FreeRADIUS 3.0.27, the version in
-- the container image). Kept here so the Node side creates the shared DB
-- deterministically BEFORE radiusd starts, rather than relying on the rlm_sql
-- `bootstrap` option (which only fires on a missing DB file and races with us).
--
-- Made fully idempotent (IF NOT EXISTS on tables AND indexes) so it is safe to
-- run on every boot. Column names/types are unchanged from the stock schema so
-- the stock authorize/accounting queries work without modification.

CREATE TABLE IF NOT EXISTS radacct (
	radacctid INTEGER PRIMARY KEY AUTOINCREMENT,
	acctsessionid varchar(64) NOT NULL default '',
	acctuniqueid varchar(32) NOT NULL default '',
	username varchar(64) NOT NULL default '',
	realm varchar(64) default '',
	nasipaddress varchar(15) NOT NULL default '',
	nasportid varchar(32) default NULL,
	nasporttype varchar(32) default NULL,
	acctstarttime datetime NULL default NULL,
	acctupdatetime datetime NULL default NULL,
	acctstoptime datetime NULL default NULL,
	acctinterval int(12) default NULL,
	acctsessiontime int(12) default NULL,
	acctauthentic varchar(32) default NULL,
	connectinfo_start varchar(128) default NULL,
	connectinfo_stop varchar(128) default NULL,
	acctinputoctets bigint(20) default NULL,
	acctoutputoctets bigint(20) default NULL,
	calledstationid varchar(50) NOT NULL default '',
	callingstationid varchar(50) NOT NULL default '',
	acctterminatecause varchar(32) NOT NULL default '',
	servicetype varchar(32) default NULL,
	framedprotocol varchar(32) default NULL,
	framedipaddress varchar(15) NOT NULL default '',
	framedipv6address varchar(45) NOT NULL default '',
	framedipv6prefix varchar(45) NOT NULL default '',
	framedinterfaceid varchar(44) NOT NULL default '',
	delegatedipv6prefix varchar(45) NOT NULL default '',
	class varchar(64) default NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS acctuniqueid ON radacct(acctuniqueid);
CREATE INDEX IF NOT EXISTS username ON radacct(username);
CREATE INDEX IF NOT EXISTS framedipaddress ON radacct (framedipaddress);
CREATE INDEX IF NOT EXISTS acctsessionid ON radacct(acctsessionid);
CREATE INDEX IF NOT EXISTS acctsessiontime ON radacct(acctsessiontime);
CREATE INDEX IF NOT EXISTS acctstarttime ON radacct(acctstarttime);
CREATE INDEX IF NOT EXISTS acctinterval ON radacct(acctinterval);
CREATE INDEX IF NOT EXISTS acctstoptime ON radacct(acctstoptime);
CREATE INDEX IF NOT EXISTS nasipaddress ON radacct(nasipaddress);

CREATE TABLE IF NOT EXISTS radcheck (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	username varchar(64) NOT NULL default '',
	attribute varchar(64)  NOT NULL default '',
	op char(2) NOT NULL DEFAULT '==',
	value varchar(253) NOT NULL default ''
);
CREATE INDEX IF NOT EXISTS check_username ON radcheck(username);

CREATE TABLE IF NOT EXISTS radgroupcheck (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	groupname varchar(64) NOT NULL default '',
	attribute varchar(64)  NOT NULL default '',
	op char(2) NOT NULL DEFAULT '==',
	value varchar(253)  NOT NULL default ''
);
CREATE INDEX IF NOT EXISTS check_groupname ON radgroupcheck(groupname);

CREATE TABLE IF NOT EXISTS radgroupreply (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	groupname varchar(64) NOT NULL default '',
	attribute varchar(64)  NOT NULL default '',
	op char(2) NOT NULL DEFAULT '=',
	value varchar(253)  NOT NULL default ''
);
CREATE INDEX IF NOT EXISTS reply_groupname ON radgroupreply(groupname);

CREATE TABLE IF NOT EXISTS radreply (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	username varchar(64) NOT NULL default '',
	attribute varchar(64) NOT NULL default '',
	op char(2) NOT NULL DEFAULT '=',
	value varchar(253) NOT NULL default ''
);
CREATE INDEX IF NOT EXISTS reply_username ON radreply(username);

CREATE TABLE IF NOT EXISTS radusergroup (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	username varchar(64) NOT NULL default '',
	groupname varchar(64) NOT NULL default '',
	priority int(11) NOT NULL default '1'
);
CREATE INDEX IF NOT EXISTS usergroup_username ON radusergroup(username);

CREATE TABLE IF NOT EXISTS radpostauth (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	username varchar(64) NOT NULL default '',
	pass varchar(64) NOT NULL default '',
	reply varchar(32) NOT NULL default '',
	authdate timestamp NOT NULL,
	class varchar(64) default NULL
);
CREATE INDEX IF NOT EXISTS radpostauth_username ON radpostauth(username);

CREATE TABLE IF NOT EXISTS nas (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	nasname varchar(128) NOT NULL,
	shortname varchar(32),
	type varchar(30) DEFAULT 'other',
	ports int(5),
	secret varchar(60) DEFAULT 'secret' NOT NULL,
	server varchar(64),
	community varchar(50),
	description varchar(200) DEFAULT 'RADIUS Client'
);
CREATE INDEX IF NOT EXISTS nasname ON nas(nasname);
