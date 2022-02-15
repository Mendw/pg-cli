# pg-cli
Utilidad para meter los datos a la BDD. Parsea los archivos .ARFF de la carpeta ./data uno por uno de manera síncrona (elegido al azar, podría ser async) e inserta el resultado en la base de datos. La idea es demostrar la manera en que se usa el parser y la manera de comunicarse con la base de datos. Probablemente va a ser necesario en algún punto modificar el código para adaptarlo a la arquitectura de Angular.

## Notas
Estoy usando la librería moment para parsear datestrings arbitrarios, moment permite además generar datestrings en formato ISO 8601, que es el que Postgres acepta por defecto.

## Feedback requerido
 - El typescript lo escribí con import y export pero genera código con require, asi que tengo que tener el proyecto en CommonJS. TSLint se molesta conmigo por el código que genera el comando **tsc**, así que probablemente hice algo mal.