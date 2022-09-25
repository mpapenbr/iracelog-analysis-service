# this script is supposed to be executed as postCreateCommand of the devcontainer
if [ -f setuplinks.sh ]; then
    . ./setuplinks.sh
fi
yarn install