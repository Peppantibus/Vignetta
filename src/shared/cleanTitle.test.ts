import { describe, expect, it } from 'vitest'
import { cleanTitle } from './cleanTitle'

describe('cleanTitle', () => {
  it('toglie anno, editore e gruppo tra parentesi', () => {
    expect(cleanTitle('Batman 001 (RW-Lion 2012-05) [gruppo]')).toBe('Batman 001')
    expect(cleanTitle('LANTERNA VERDE Rinascita (Planeta)(c2c)(by Gruppo)(12-2006)')).toBe('Lanterna Verde Rinascita')
    expect(cleanTitle('Superman - Stagioni - Loeb-Sale - RW Lion (C2C)')).toBe('Superman - Stagioni - Loeb-Sale')
  })

  it('toglie «c2c» con i crediti che lo seguono e le date o gli editori rimasti in fondo', () => {
    expect(cleanTitle('Marvel Masterworks 001 Spider Man 1 Panini c2c gruppo e amici')).toBe('Marvel Masterworks 001 Spider Man 1')
    expect(cleanTitle('Supergirl, la donna del domani Panini 2024 c2c gruppo')).toBe('Supergirl, la donna del domani')
    expect(cleanTitle('Dragon Ball 01 Son Goku e i suoi compagni RCS 2017 04 27 c2c Gruppo')).toBe('Dragon Ball 01 Son Goku e i suoi compagni')
    expect(cleanTitle('Spiderman Universe 01 - Venom 01 - scan&edit Gruppo')).toBe('Spiderman Universe 01 - Venom 01')
    expect(cleanTitle('Scanners 2')).toBe('Scanners 2')
    expect(cleanTitle('Marvel_Miniserie_201_La_Resurrezione_di_Fenice_1_2018_07c2c_gruppo63')).toBe('Marvel Miniserie 201 La Resurrezione di Fenice 1')
  })

  it('toglie «By …» solo dopo una parentesi o un anno', () => {
    expect(cleanTitle('Must Have 04 - Wolverine Vecchio Logan (2020) By Gruppo')).toBe('Must Have 04 - Wolverine Vecchio Logan')
    expect(cleanTitle('Must Have 08 Spider Man Chi È Miles Morales 2020 By Gruppo')).toBe('Must Have 08 Spider Man Chi È Miles Morales')
    expect(cleanTitle('Must Have 33 - Daredevil - Rinascita (2021) By Uno   Due')).toBe('Must Have 33 - Daredevil - Rinascita')
    expect(cleanTitle('Stand by me')).toBe('Stand by me')
  })

  it('decodifica i codici HTML rimasti nel nome, anche con lo spazio', () => {
    expect(cleanTitle('UOMO RAGNO 2099 n 00 Speciale & #40;by Uno&amp;Due&#41;XYZ')).toBe('Uomo Ragno 2099 n 00 Speciale')
    expect(cleanTitle('Tom &amp; Jerry')).toBe('Tom & Jerry')
    expect(cleanTitle('Codice &#0; non valido')).toBe('Codice &#0; non valido')
  })

  it('usa i punti come spazi e conserva il numero tra parentesi', () => {
    expect(cleanTitle('Batman.-.HUSH.[Vol.01.di.12].[Scan].[ITA]')).toBe('Batman - Hush Vol. 01 di 12')
    expect(cleanTitle('Batman.-.HUSH.[Vol.01.di.12].[Scan].[ITA]', { keepIssue: false })).toBe('Batman - Hush')
    expect(cleanTitle('Saga [01 of 03]')).toBe('Saga 01 of 03')
    expect(cleanTitle('Il_ritorno_di_Batman')).toBe('Il ritorno di Batman')
    expect(cleanTitle('Batman 1.5')).toBe('Batman 1.5')
  })

  it('sistema le maiuscole senza toccare sigle brevi e numeri romani', () => {
    expect(cleanTitle('X-MEN La saga di DC')).toBe('X-Men La saga di DC')
    expect(cleanTitle('Rocky VIII')).toBe('Rocky VIII')
    expect(cleanTitle('superman redson')).toBe('Superman redson')
    expect(cleanTitle('Monster - Naoki Urasawa vol 01')).toBe('Monster - Naoki Urasawa Vol. 01')
  })

  it('lascia i titoli già puliti e gli anni che fanno parte del titolo', () => {
    for (const title of ['Batman-The Killing Joke', 'Marvel Miniserie 045 - Spiderman - Blue 1', 'Superman All Star', 'Batman 1989', 'Spider-Man 2099 (Panini)']) {
      expect(cleanTitle(title)).toBe(title === 'Spider-Man 2099 (Panini)' ? 'Spider-Man 2099' : title)
    }
  })

  it('torna al nome originale se non resta niente', () => {
    expect(cleanTitle('(2020) [gruppo]')).toBe('(2020) [gruppo]')
  })
})
