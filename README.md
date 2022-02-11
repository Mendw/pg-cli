# pg-cli
Utilidad para meter los datos a la BDD

## NOTAS
Estoy usando la librería moment para parsear los datestrings y generar datestrings en formato ISO 8601. Parece que a Postgres le gusta eso

## PROBLEMAS CONOCIDOS
Intento mantener el nombre original de las columnas exceptuando caracteres que rompen Postgres, eso significa que algunas tablas y columnas tienen sus nombres en mayúsculas y hay que usar comillas dobles para accesarlas