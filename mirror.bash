#!/bin/bash
#rm -rv !("mirror.bash"|"README.md")
wget --mirror --convert-links --page-requisites --adjust-extension http://dev.scaffoldai.com:9090/
mv dev.scaffoldai.com\:9090/* .
rm -r dev.scaffoldai.com\:9090
