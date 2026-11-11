// ─────────────────────────────────────────────────────────────────────────────
// Προσθήκες στο custom JS «iSite» του SoftOne: εγγραφή χαρακτηριστικών ανά είδος
// και υποκατηγοριών web (L2). Μπαίνουν στο ίδιο αρχείο με τα getItems, getAttributes κ.λπ.
// και χρησιμοποιούν τα checkClientId, responseError, sql2jsonstr που ήδη υπάρχουν εκεί.
//
// Γράφουν απευθείας με SQL, γιατί:
//  • το CCCITEMWEBSPECSLNS δεν έχει LINENUM και το setData κρατά μόνο την τελευταία γραμμή,
//  • το CCCWEBCATEGORY2 έχει μόνο EditList ($CCCWEBCATEGORY2), που ξαναγράφει όλη τη λίστα.
// Κάθε συνάρτηση αγγίζει ΜΟΝΟ τις γραμμές που της στέλνουμε, μέσα σε transaction, και
// επιστρέφει ό,τι διάβασε πίσω, ώστε να ελέγχουμε τι αποθηκεύτηκε.
// Όλες οι τιμές από το αίτημα περνούν από toInt / sqlStr, γιατί καταλήγουν μέσα σε SQL.
// ─────────────────────────────────────────────────────────────────────────────

function toInt(v)
{
		var n = parseInt(v, 10);
		if (isNaN(n) || String(n) != String(v).replace(/^\s+|\s+$/g, "")) throw "Μη έγκυρος αριθμός: " + v;
		return n;
}

function sqlStr(v)
{
		if (v === null || v === undefined || String(v) === "") return "NULL";
		// Το SoftOne αλλάζει τα & και : μέσα στο SQL (το & γίνεται :), γι' αυτό μπαίνουν ως NCHAR.
		return "N'" + String(v).replace(/'/g, "''").replace(/&/g, "' + NCHAR(38) + N'").replace(/:/g, "' + NCHAR(58) + N'") + "'";
}

function fail(msg)
{
		var resp = {};
		resp.success = false;
		resp.error = String(msg);
		return resp;
}

// ── 1. Χαρακτηριστικά ανά είδος ──────────────────────────────────────────────
// Είσοδος:
//   MTRL    : το είδος
//   GROUPID : η ομάδα χαρακτηριστικών (CCCWEBGRSPECS). Πρέπει να είναι αυτή του είδους.
//   SPECS   : [{ "ACODE": 1, "STRVAL": "GAUZER" }, { "ACODE": 2, "STRVAL": "200", "VALUE": 15 }, ...]
//             ACODE = WEBSPECS του CCCWEBSPECS. Κενό STRVAL = καθαρίζει την τιμή.
// Κάνει upsert μόνο στις γραμμές που στέλνουμε. Τις υπόλοιπες γραμμές του είδους δεν τις αγγίζει.
function setItemSpecs(obj)
{
		if (!checkClientId(obj)) return responseError(obj);
		try
		{
			var mtrl = toInt(obj.MTRL), grp = toInt(obj.GROUPID);
			var specs = obj.SPECS;
			if (!specs || !specs.length) return fail("Δεν στάλθηκαν χαρακτηριστικά (SPECS).");

			// Το είδος υπάρχει και ανήκει σε αυτή την ομάδα χαρακτηριστικών.
			var it = X.GETSQLDATASET("select cccwebgrspecs from mtrl where company=:X.SYS.COMPANY and sodtype=51 and mtrl=" + mtrl, null);
			if (it.RECORDCOUNT == 0) return fail("Δεν βρέθηκε το είδος " + mtrl + ".");
			if (toInt(it.CCCWEBGRSPECS) != grp) return fail("Το είδος " + mtrl + " ανήκει στην ομάδα " + it.CCCWEBGRSPECS + ", όχι στην " + grp + ".");

			var sql = "SET XACT_ABORT ON; BEGIN TRAN; ";
			for (var i = 0; i < specs.length; i++)
			{
				var a = toInt(specs[i].ACODE);
				var val = (specs[i].VALUE === undefined || specs[i].VALUE === null || specs[i].VALUE === "") ? "NULL" : toInt(specs[i].VALUE);
				var str = sqlStr(specs[i].STRVAL);
				var key = "company=:X.SYS.COMPANY and webmtrl=" + mtrl + " and cccwebgrspecs=" + grp + " and webspecs=" + a;
				// Το χαρακτηριστικό πρέπει να υπάρχει στην ομάδα, αλλιώς αποτυγχάνει όλο το transaction.
				sql += "IF NOT EXISTS (select 1 from cccwebspecs where company=:X.SYS.COMPANY and cccwebgrspecs=" + grp + " and webspecs=" + a + ") "
				     + "  RAISERROR('Το χαρακτηριστικό " + a + " δεν ανήκει στην ομάδα " + grp + "', 16, 1); "
				     + "IF EXISTS (select 1 from cccitemwebspecslns where " + key + ") "
				     + "  update cccitemwebspecslns set strsovalue=" + str + ", soval=" + val + ", upddate=GETDATE() where " + key + " "
				     + "ELSE "
				     + "  insert into cccitemwebspecslns (company, webmtrl, cccwebgrspecs, webspecs, strsovalue, soval, upddate) "
				     + "  values (:X.SYS.COMPANY, " + mtrl + ", " + grp + ", " + a + ", " + str + ", " + val + ", GETDATE()); ";
			}
			sql += "COMMIT;";
			X.RUNSQL(sql, null);

			// Ό,τι αποθηκεύτηκε, για επαλήθευση από την πλευρά μας.
			return sql2jsonstr("select webmtrl as productid, cccwebgrspecs as groupid, webspecs as acode, strsovalue as strval, soval as value from cccitemwebspecslns where company=:X.SYS.COMPANY and webmtrl=" + mtrl + " order by webspecs");
		}
		catch (e)
		{
			return fail(e.message ? e.message : e);
		}
}

// ── 2. Υποκατηγορία web (L2, CCCWEBCATEGORY2) ────────────────────────────────
// Είσοδος:
//   MASTERCODE : η κεντρική κατηγορία (CCCWEBCATEGORY1). Πρέπει να υπάρχει.
//   CODE       : (προαιρετικό) υπάρχουσα υποκατηγορία για μετονομασία ή απενεργοποίηση. Χωρίς CODE = νέα.
//   NAME       : όνομα (υποχρεωτικό)
//   ISACTIVE   : 1 ή 0 (προεπιλογή 1)
// Γράφει μία γραμμή. Δεν σβήνει ποτέ, γιατί τις υποκατηγορίες τις χρησιμοποιούν είδη.
function setMainCategory(obj)
{
		if (!checkClientId(obj)) return responseError(obj);
		try
		{
			var master = toInt(obj.MASTERCODE);
			var name = String(obj.NAME || "").replace(/^\s+|\s+$/g, "");
			if (name == "") return fail("Χρειάζεται όνομα (NAME).");
			var active = (obj.ISACTIVE === undefined || obj.ISACTIVE === null || obj.ISACTIVE === "") ? 1 : (toInt(obj.ISACTIVE) ? 1 : 0);

			var m = X.GETSQLDATASET("select 1 from cccwebcategory1 where company=:X.SYS.COMPANY and cccwebcategory1=" + master, null);
			if (m.RECORDCOUNT == 0) return fail("Δεν υπάρχει κεντρική κατηγορία " + master + ".");

			var code;
			if (obj.CODE !== undefined && obj.CODE !== null && obj.CODE !== "")
			{
				code = toInt(obj.CODE);
				var key = "company=:X.SYS.COMPANY and cccwebcategory1=" + master + " and cccwebcategory2=" + code;
				var ex = X.GETSQLDATASET("select 1 from cccwebcategory2 where " + key, null);
				if (ex.RECORDCOUNT == 0) return fail("Δεν υπάρχει υποκατηγορία " + code + " κάτω από την " + master + ".");
				X.RUNSQL("update cccwebcategory2 set name=" + sqlStr(name) + ", isactive=" + active + ", upddate=GETDATE() where " + key, null);
			}
			else
			{
				// Νέος κωδικός: ο μεγαλύτερος σε όλη την εταιρεία +1, ώστε να είναι μοναδικός όποιο κι αν είναι το κλειδί.
				// UPDLOCK/HOLDLOCK: δύο ταυτόχρονες κλήσεις δεν παίρνουν τον ίδιο κωδικό.
				X.RUNSQL("SET XACT_ABORT ON; BEGIN TRAN; "
				       + "declare @c int; select @c = isnull(max(cccwebcategory2),0)+1 from cccwebcategory2 with (UPDLOCK, HOLDLOCK) where company=:X.SYS.COMPANY; "
				       + "insert into cccwebcategory2 (company, cccwebcategory1, cccwebcategory2, name, isactive, upddate) "
				       + "values (:X.SYS.COMPANY, " + master + ", @c, " + sqlStr(name) + ", " + active + ", GETDATE()); "
				       + "COMMIT;", null);
				var n = X.GETSQLDATASET("select max(cccwebcategory2) as c from cccwebcategory2 where company=:X.SYS.COMPANY and cccwebcategory1=" + master + " and name=" + sqlStr(name), null);
				code = n.C;
			}
			return sql2jsonstr("select cccwebcategory1 as mastercode, cccwebcategory2 as code, name, isactive from cccwebcategory2 where company=:X.SYS.COMPANY and cccwebcategory1=" + master + " and cccwebcategory2=" + code);
		}
		catch (e)
		{
			return fail(e.message ? e.message : e);
		}
}

// ── 3. Κατηγορία web και ομάδα χαρακτηριστικών ενός είδους ───────────────────
// Είσοδος: MTRL, MASTERCODE, MAINCODE, GROUPID.
// Ελέγχει ότι η υποκατηγορία ανήκει στην κεντρική και η ομάδα στην υποκατηγορία, και μετά ενημερώνει το είδος.
// Δεν αλλάζει ούτε σβήνει τις τιμές χαρακτηριστικών του είδους (τις γράφει το setItemSpecs).
function setItemWebCategory(obj)
{
		if (!checkClientId(obj)) return responseError(obj);
		try
		{
			var mtrl = toInt(obj.MTRL), c1 = toInt(obj.MASTERCODE), c2 = toInt(obj.MAINCODE), grp = toInt(obj.GROUPID);
			var ok = X.GETSQLDATASET("select 1 from cccwebcategory2 w2, cccwebgrspecs g "
			                       + "where w2.company=:X.SYS.COMPANY and w2.cccwebcategory1=" + c1 + " and w2.cccwebcategory2=" + c2 + " "
			                       + "and g.company=w2.company and g.cccwebgrspecs=" + grp + " and g.cccwebcategory1=" + c1 + " and g.cccwebcategory2=" + c2, null);
			if (ok.RECORDCOUNT == 0) return fail("Ο συνδυασμός κατηγορία " + c1 + " / υποκατηγορία " + c2 + " / ομάδα " + grp + " δεν υπάρχει.");
			X.RUNSQL("update mtrl set cccwebcategory1=" + c1 + ", cccwebcategory2=" + c2 + ", cccwebgrspecs=" + grp + ", upddate=GETDATE() "
			       + "where company=:X.SYS.COMPANY and sodtype=51 and mtrl=" + mtrl, null);
			return sql2jsonstr("select mtrl as productid, cccwebcategory1 as mastercategory, cccwebcategory2 as maincategory, cccwebgrspecs as groupid from mtrl where company=:X.SYS.COMPANY and sodtype=51 and mtrl=" + mtrl);
		}
		catch (e)
		{
			return fail(e.message ? e.message : e);
		}
}
