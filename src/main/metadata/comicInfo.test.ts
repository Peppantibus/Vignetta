import { describe, expect, it } from 'vitest'
import { parseComicInfo } from './comicInfo'

describe('parseComicInfo', () => {
  it('legge i campi principali e ignora le parti annidate', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
      <ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <Title>Gli anni d'oro</Title>
        <Series>Spider-Man: Blue</Series>
        <Number>1</Number>
        <Count>3</Count>
        <Year>2003</Year>
        <Writer>Jeph Loeb</Writer>
        <Penciller>Tim Sale</Penciller>
        <Publisher>Panini Comics</Publisher>
        <Summary>Peter ricorda &amp; racconta &#8220;Gwen&#8221;.</Summary>
        <Pages><Page Image="0" Type="FrontCover" /></Pages>
      </ComicInfo>`
    expect(parseComicInfo(xml)).toEqual({
      title: "Gli anni d'oro",
      series: 'Spider-Man: Blue',
      number: '1',
      count: 3,
      year: 2003,
      writer: 'Jeph Loeb',
      penciller: 'Tim Sale',
      publisher: 'Panini Comics',
      summary: 'Peter ricorda & racconta “Gwen”.'
    })
  })

  it('riconosce i manga da leggere da destra a sinistra', () => {
    expect(parseComicInfo('<ComicInfo><Series>One Piece</Series><Manga>YesAndRightToLeft</Manga></ComicInfo>')).toEqual({
      series: 'One Piece',
      rightToLeft: true
    })
    expect(parseComicInfo('<ComicInfo><Series>X</Series><Manga>Yes</Manga></ComicInfo>')).toEqual({ series: 'X' })
  })

  it('restituisce null per file vuoti o non validi', () => {
    expect(parseComicInfo('<ComicInfo><Title> </Title><Year>0</Year></ComicInfo>')).toBeNull()
    expect(parseComicInfo('non è xml')).toBeNull()
  })

  it('legge personaggi, squadre e marchio editoriale', () => {
    expect(parseComicInfo('<ComicInfo><Publisher>DC Comics</Publisher><Imprint>Vertigo</Imprint><Characters>Batman, Robin</Characters><Teams>Justice League</Teams></ComicInfo>')).toEqual({
      publisher: 'DC Comics',
      imprint: 'Vertigo',
      characters: 'Batman, Robin',
      teams: 'Justice League'
    })
  })

  it("un codice di carattere non valido resta com'è senza far perdere gli altri campi", () => {
    expect(parseComicInfo('<ComicInfo><Series>Batman</Series><Summary>A &#x110000; B &#0; C &#xD800; D &#99999999999; E &#233;</Summary></ComicInfo>')).toEqual({
      series: 'Batman',
      summary: 'A &#x110000; B &#0; C &#xD800; D &#99999999999; E é'
    })
  })

  it('gestisce le sezioni CDATA', () => {
    expect(parseComicInfo('<ComicInfo><Summary><![CDATA[Una <b>storia</b>]]></Summary></ComicInfo>')).toEqual({ summary: 'Una <b>storia</b>' })
  })
})
