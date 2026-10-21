# Vignetta

**Un lettore di fumetti e manga per Windows, con una libreria che sembra uno scaffale vero.**

Aggiungi le cartelle dove tieni i tuoi fumetti e Vignetta li mette in mostra con le loro copertine,
li raggruppa per serie e si ricorda dove eri arrivato. Poi apri un albo e leggi, senza distrazioni.

## La libreria

- **Copertine in primo piano**: ogni fumetto è una copertina, gli albi della stessa serie diventano una pila.
- **Continua a leggere**: in cima trovi quello che hai lasciato a metà, alla pagina giusta, e sotto gli albi
  aggiunti di recente.
- **Titoli leggibili**: dai nomi dei file scaricati spariscono anno, editore, gruppo e sigle come «c2c»
  (il file non viene rinominato).
- **Categorie**: Marvel, DC, Manga e Altri. Il riconoscimento è semplice (nomi di personaggi, serie e autori
  più noti, metadati `ComicInfo.xml` quando ci sono) e non indovina sempre: con il tasto destro si corregge a mano.
- **Sempre aggiornata**: i fumetti nuovi nelle tue cartelle compaiono da soli, anche a fine download.
- **Volumi**: più albi della stessa serie si possono unire in un unico volume da leggere di fila, senza toccare i file.
- **Spazio sul disco**: finito un albo puoi eliminarlo, ma la scheda e la cronologia di lettura restano.

## Il lettore

- Pagina singola o doppia, con le tavole orizzontali a tutta larghezza.
- Modalità manga, da destra a sinistra.
- Zoom, lente d'ingrandimento e panoramica di tutte le pagine.
- Ritaglio automatico dei bordi bianchi e modalità notte che scalda la carta.

Premi `?` nel lettore per vedere tutte le scorciatoie.

**Formati:** CBZ, CBR, ZIP, RAR, PDF e cartelle di immagini.

## Installazione

Scarica `Vignetta-Setup-<versione>.exe` ed eseguilo. Serve Windows 10 o 11.

L'installer non è firmato, quindi Windows potrebbe mostrare «Windows ha protetto il PC»:
clicca **Ulteriori informazioni** → **Esegui comunque**.

Libreria e progressi sono salvati in `%APPDATA%\Vignetta`, con una copia di sicurezza al giorno.
Dal pannello «Cartelle» puoi tenerne un'altra su un secondo disco o nel cloud.

## Per sviluppatori

Electron, TypeScript e React, con il minimo indispensabile di librerie.

```sh
npm install
npm run dev        # avvia in sviluppo
npm test           # test
npm run installer  # crea l'installer in dist/
```

## Note

Vignetta non contiene fumetti: legge quelli che hai già. Non è affiliato con Marvel, DC o altri editori;
personaggi e marchi appartengono ai rispettivi titolari.
I font Inter e Bricolage Grotesque sono distribuiti con licenza SIL OFL 1.1, le icone vengono da Lucide (licenza ISC).
