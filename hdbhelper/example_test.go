package hdbhelper_test

import (
	"fmt"

	"github.com/SAP-samples/hana-hdbext-promisfied-example/hdbhelper"
)

func ExampleObjectName() {
	fmt.Println(hdbhelper.ObjectName(""))
	fmt.Println(hdbhelper.ObjectName("*"))
	fmt.Println(hdbhelper.ObjectName("MY_TABLE"))
	// Output:
	// %
	// %
	// MY_TABLE%
}

func ExampleResolveEnvPath() {
	path := hdbhelper.ResolveEnvPath(false)
	fmt.Println(path != "")
	adminPath := hdbhelper.ResolveEnvPath(true)
	fmt.Println(adminPath != path)
	// Output:
	// true
	// true
}
