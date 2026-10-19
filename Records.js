const CLE_RECORD = 'monjeu-record';   

// Renvoie { lances, temps } ou null s'il n'y a pas encore de record
function lireRecord(niveau) {
  try {
    const brut = localStorage.getItem(cleRecord(niveau));
    if (brut === null) return null;
    const r = JSON.parse(brut);
    if (typeof r.lances !== 'number' || typeof r.temps !== 'number') return null;
    return r;
  } catch (e) {
    return null;
  }
}



// Enregistre la partie si elle bat le record. Renvoie true si c'est un nouveau record.
function enregistrerSiRecord(niveau, lances, temps) {
  const partie = { lances: lances, temps: temps };
  const ancien = lireRecord(niveau);
  if (ancien === null || estMeilleur(partie, ancien)) {
    try { localStorage.setItem(cleRecord(niveau), JSON.stringify(partie)); } catch (e) {}
    return true;
  }
  return false;
}

// a bat b ? : moins de lancers, ou à égalité de lancers, un temps plus court
function estMeilleur(a, b) {
  if (a.lances !== b.lances) return a.lances < b.lances;
  return a.temps < b.temps;
}